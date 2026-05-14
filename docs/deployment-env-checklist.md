# Deployment Environment Checklist

This checklist defines required and recommended environment variables for:
- Render API deployment
- Railway API deployment
- Web host deployment (Vercel/Netlify/Render Static)


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

## 1) Render API (services/api)

Reference: render blueprint at `render.yaml`.

### Required (must set)
- `NODE_ENV=production`
- `STARTUP_STRICT=1`
- `DATABASE_URL` (from Render Postgres)
- `API_KEY` (high-entropy secret; at least 32 chars)
- `CORS_ALLOWED_ORIGINS` (comma-separated HTTPS origins)
- `RPC_URL` (Amoy RPC endpoint)
- `PRIVATE_KEY` (deployer/signer key)
- `SBT_CONTRACT_ADDRESS` (0x + 40 hex)
- `LIFEPASS_SSO_JWT_SECRET` (high-entropy secret)

### Conditionally required
- `TRUST_REGISTRY_ADDRESS` if using on-chain milestone anchoring
- `AGE_VERIFIER_ADDRESS` if `REQUIRE_AGE_VERIFIER=1`
- `SNARK_WASM_PATH`, `SNARK_ZKEY_PATH`, `SNARK_VKEY_PATH` if `USE_SNARKJS=1`
- Exactly one admin auth mode for portal policy admin endpoints
- Key mode: `POLICY_ADMIN_KEY` or `POLICY_ADMIN_KEYS_JSON`
- JWT mode: `POLICY_ADMIN_JWT_SECRET`
- `POLICY_ADMIN_ALLOWED_ACTORS` when actor allowlisting is required
- `POLICY_ADMIN_REQUIRED_ROLE` when JWT mode uses a non-default role name
- `POLICY_APPROVAL_SIGNING_KEYS_JSON` if `POLICY_TWO_PERSON_REQUIRED=1`

### Recommended defaults
- `CORS_ALLOW_CREDENTIALS=0`
- `REQUIRE_AGE_VERIFIER=1`
- `USE_SNARKJS=1` for real proof mode
- `LIFEPASS_SSO_JWT_ISSUER=lifepass-api`
- `LIFEPASS_SSO_DEFAULT_AUDIENCE=zionstack-portals`
- `LIFEPASS_SSO_JWT_EXPIRES_IN=15m`
- `PORTAL_ACCESS_AUDIT_MAX_ROWS=2000`
- `POLICY_ADMIN_AUDIT_MAX_ROWS=2000`
- `POLICY_SNAPSHOT_MAX_ROWS=500`
- `PORTAL_DENY_ALERT_THRESHOLD=10`
- `PORTAL_DENY_ALERT_WINDOW_MINUTES=60`
- `POLICY_TWO_PERSON_REQUIRED=1`
- `POLICY_REQUIRED_APPROVALS=2`
- `POLICY_APPROVAL_MAX_ROWS=2000`

## 2) Railway API (services/api)

Reference: `railway.json` (build/start/health only). Railway does not predeclare env vars in that file, so set the same API envs as Render.

### Required (same as Render API)
- `NODE_ENV=production`
- `STARTUP_STRICT=1`
- `DATABASE_URL`
- `API_KEY`
- `CORS_ALLOWED_ORIGINS`
- `RPC_URL`
- `PRIVATE_KEY`
- `SBT_CONTRACT_ADDRESS`
- `LIFEPASS_SSO_JWT_SECRET`

### Conditionally required and recommended
- Same as Render API section above.

## 3) Web Host (apps/web)

Reference: `apps/web/.env.example` and `apps/web/pages/api/mint.js`.

### Required (must set)
- `API_BASE_URL` (server-side URL of API, e.g. `https://lifepass-api.onrender.com`)
- `API_KEY` (same value as API service)
- `ADMIN_CONSOLE_SESSION_SECRET` (high-entropy secret for the server-side admin session cookie)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (real WalletConnect project id)

### Recommended
- `NEXT_PUBLIC_API_BASE_URL` only if the browser should call API directly
- Keep `NEXT_PUBLIC_API_BASE_URL` empty when using Next rewrites/proxy for local dev
- `LOCAL_API_BASE_URL=http://localhost:3003` for local development

## 4) Example Production Values

Use your own secrets and domains; these are shape examples only.

```env
# API
NODE_ENV=production
STARTUP_STRICT=1
API_KEY=<high_entropy_secret>
CORS_ALLOWED_ORIGINS=https://app.lifepass.example
CORS_ALLOW_CREDENTIALS=0
RPC_URL=https://rpc-amoy.polygon.technology
PRIVATE_KEY=0x<64_hex>
SBT_CONTRACT_ADDRESS=0x<40_hex>
TRUST_REGISTRY_ADDRESS=0x<40_hex>
REQUIRE_AGE_VERIFIER=1
AGE_VERIFIER_ADDRESS=0x<40_hex>
USE_SNARKJS=1
SNARK_WASM_PATH=/opt/render/project/src/zk/over18.wasm
SNARK_ZKEY_PATH=/opt/render/project/src/zk/over18.zkey
SNARK_VKEY_PATH=/opt/render/project/src/zk/over18.vkey
LIFEPASS_SSO_JWT_SECRET=<high_entropy_secret>
LIFEPASS_SSO_JWT_ISSUER=lifepass-api
LIFEPASS_SSO_DEFAULT_AUDIENCE=zionstack-portals
LIFEPASS_SSO_JWT_EXPIRES_IN=15m
POLICY_ADMIN_KEY=<high_entropy_secret>
# or, instead of POLICY_ADMIN_KEY:
# POLICY_ADMIN_KEYS_JSON={"current":"<high_entropy_secret>"}
# or, instead of key mode:
# POLICY_ADMIN_JWT_SECRET=<high_entropy_secret>
# POLICY_ADMIN_REQUIRED_ROLE=policy_admin
# POLICY_ADMIN_ALLOWED_ACTORS=ops@example.com
POLICY_TWO_PERSON_REQUIRED=1
POLICY_REQUIRED_APPROVALS=2
POLICY_APPROVAL_SIGNING_KEYS_JSON={"ops1":"<secret1>","ops2":"<secret2>"}

# WEB
API_BASE_URL=https://lifepass-api.onrender.com
API_KEY=<same_as_api_key>
ADMIN_CONSOLE_SESSION_SECRET=<high_entropy_secret>
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<walletconnect_project_id>
```

Do not configure key mode and JWT mode together. Production must choose one admin auth mode per deployment.

For repo-side contract validation before deploy, run `node ./scripts/validate_deployment_contract.js` from the repository root.

For hosted env validation, pull the deployment env file first and run the same script against the snapshot you exported:

```bash
node ./scripts/validate_deployment_contract.js --skip-render --skip-railway --skip-web-env-example --api-env ./.render-api.env --api-env-label "Render production API environment"
node ./scripts/validate_deployment_contract.js --skip-render --skip-railway --skip-web-env-example --api-env ./.railway-api.env --api-env-label "Railway production API environment"
node ./scripts/validate_deployment_contract.js --skip-render --skip-railway --skip-web-env-example --web-env ./.vercel-web.env --web-env-label "Vercel production environment"
```

On Windows, you can use the PowerShell wrapper instead:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate-hosted-env.ps1 -Target render-api -EnvFile .\.render-api.env
powershell -ExecutionPolicy Bypass -File .\scripts\validate-hosted-env.ps1 -Target railway-api -EnvFile .\.railway-api.env
powershell -ExecutionPolicy Bypass -File .\scripts\validate-hosted-env.ps1 -Target vercel-web -EnvFile .\.vercel-web.env
```

## 5) Pre-Go-Live Verification

Run these checks before release:

```powershell
# API readiness
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-readiness.ps1 -Mode testnet

# API strict smoke
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-smoke.ps1 -Mode testnet

# Optional Render health review
powershell -ExecutionPolicy Bypass -File .\scripts\check-render-health.ps1 -ApiBaseUrl https://<api-domain>
```
