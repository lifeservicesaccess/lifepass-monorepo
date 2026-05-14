# CI/CD Pipeline

Continuous integration and continuous deployment (CI/CD) help maintain code quality and accelerate release cycles.  This document outlines a sample GitHub Actions workflow for the LifePass project.

## Blueprint Release Gates

Production-aligned CI/CD must reject blueprint drift before deploy. At minimum, releases should fail when any of these conditions are true:

1. `STARTUP_STRICT=1` would fail for the API.
2. Policy admin auth is configured in mixed mode (`POLICY_ADMIN_KEY` / `POLICY_ADMIN_KEYS_JSON` together with `POLICY_ADMIN_JWT_SECRET`).
3. `ALLOW_INSECURE_FILE_GOVERNANCE=1` is present in a normal production release.
4. `REQUIRE_DURABLE_GOVERNANCE=1` is missing for production API deployments.
5. The web host is missing `ADMIN_CONSOLE_SESSION_SECRET`, which is required to keep the admin console behind a server-side session.

The repository now centralizes these checks in `node ./scripts/validate_deployment_contract.js` so CI and deployment gates enforce the same contract.

## Workflow Steps

1. **Checkout & Setup**
   - Use the `actions/checkout` action to pull the repository.
   - Set up Node.js and install dependencies for the API and frontend (`npm install`).
   - Install Foundry or Hardhat for contract compilation and testing.

2. **Lint & Format**
   - Run ESLint and Prettier to ensure consistent code style.  Fail the build if any issues are found.

3. **Test**
   - Compile and run the Solidity tests with Foundry (`forge test`).
   - Execute API unit tests (e.g., with Jest).
  - Build the frontend and fail if the admin session or proxy routes do not compile.
  - Optionally run end‑to‑end tests for the frontend using Playwright or Cypress.

4. **Build**
   - Generate the production build of the Next.js app (`next build`).
   - Bundle the mobile app (Expo or React Native CLI).

5. **Deploy**
   - Deploy smart contracts to a testnet using a configured private key and RPC URL.
   - Deploy the API as a Docker container or to a serverless platform.
   - Upload the frontend build to a static hosting provider (e.g., Vercel or Netlify).

## Sample GitHub Actions Workflow

Create a file at `.github/workflows/ci.yml` with the following contents as a starting point:

```yaml
name: CI
on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - name: Install dependencies
        run: |
          cd services/api && npm install
          cd ../../apps/web && npm install
      - name: Lint API and frontend
        run: |
          cd services/api && npx eslint . --max-warnings=0
          cd ../../apps/web && npx eslint . --max-warnings=0
      - name: Run API tests
        run: |
          cd services/api && npm run check:schema && npm test
      - name: Compile and test contracts
        run: |
          forge build
          forge test
      - name: Build web app
        run: |
          cd apps/web && npm run build
```

Adjust the workflow as needed for deployment steps and additional services.  Store secrets (e.g., RPC URLs, private keys) in GitHub repository secrets and reference them in the workflow.

For blueprint-first admin governance, do not allow CI or deployment templates to carry both key-based and JWT-based policy admin config at the same time. The API health contract now treats that as a failure, and `STARTUP_STRICT=1` should stop the release.

For stricter release gating, set `REQUIRE_AGE_VERIFIER=1` together with `STARTUP_STRICT=1` so CI/runtime startup fails when `AGE_VERIFIER_ADDRESS` is missing or invalid.

For governance-hardening releases, also set `REQUIRE_DURABLE_GOVERNANCE=1`, leave `ALLOW_INSECURE_FILE_GOVERNANCE` unset, and verify the web host has a non-empty `ADMIN_CONSOLE_SESSION_SECRET` configured so `/admin` cannot render as a public credential-entry page.

The production Vercel deploy job now pulls the production environment and fails before deploy if the required web-host contract is incomplete, including a missing or empty `ADMIN_CONSOLE_SESSION_SECRET`.

From the repo root, you can run the same static contract checks locally with:

```bash
node ./scripts/validate_deployment_contract.js
```

You can also validate pulled deployment env snapshots with the same script:

```bash
node ./scripts/validate_deployment_contract.js --skip-render --skip-railway --skip-web-env-example --api-env ./.render-api.env --api-env-label "Render production API environment"
node ./scripts/validate_deployment_contract.js --skip-render --skip-railway --skip-web-env-example --web-env ./.vercel-web.env --web-env-label "Vercel production environment"
```


## Exporting Hosted Environment Snapshots

To fetch the latest environment variables from Render or Railway before validation, use the provided helper scripts:

```powershell
# Export Render API env vars to .render-api.env
powershell -ExecutionPolicy Bypass -File .\scripts\export-render-api-env.ps1 -ServiceId <render_service_id> -OutFile .\.render-api.env

# Export Railway API env vars to .railway-api.env
powershell -ExecutionPolicy Bypass -File .\scripts\export-railway-api-env.ps1 -ProjectId <railway_project_id> -ServiceName <service_name> -OutFile .\.railway-api.env
```

Then validate the exported env files against the repo deployment contract:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-hosted-env.ps1 -Target render-api -EnvFile .\.render-api.env
powershell -ExecutionPolicy Bypass -File .\scripts\validate-hosted-env.ps1 -Target railway-api -EnvFile .\.railway-api.env
powershell -ExecutionPolicy Bypass -File .\scripts\validate-hosted-env.ps1 -Target vercel-web -EnvFile .\.vercel-web.env
```

For Sprint 1, keep SQL migration artifacts under `services/api/db/migrations/` and enforce their presence with `npm run check:schema`.

## Optional SNARK CI Stage

The repository CI workflow also supports an optional SNARK-enabled smoke stage (`zk-mode-smoke`).
It runs only when repository variable `USE_SNARKJS` is set to `1` and validates artifact wiring with:

- `SNARK_WASM_PATH`
- `SNARK_ZKEY_PATH`
- `SNARK_VKEY_PATH`

These variables should point to artifact files available in the checked-out workspace for the CI runner.

Contract checks in CI use `foundry-rs/foundry-toolchain@v1` to install Foundry before running `forge build` and `forge test`.