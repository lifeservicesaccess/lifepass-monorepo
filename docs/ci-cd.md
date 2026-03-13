# CI/CD Pipeline

Continuous integration and continuous deployment (CI/CD) help maintain code quality and accelerate release cycles.  This document outlines a sample GitHub Actions workflow for the LifePass project.

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

For Sprint 1, keep SQL migration artifacts under `services/api/db/migrations/` and enforce their presence with `npm run check:schema`.

## Optional SNARK CI Stage

The repository CI workflow also supports an optional SNARK-enabled smoke stage (`zk-mode-smoke`).
It runs only when repository variable `USE_SNARKJS` is set to `1` and validates artifact wiring with:

- `SNARK_WASM_PATH`
- `SNARK_ZKEY_PATH`
- `SNARK_VKEY_PATH`

These variables should point to artifact files available in the checked-out workspace for the CI runner.

Contract checks in CI use `foundry-rs/foundry-toolchain@v1` to install Foundry before running `forge build` and `forge test`.