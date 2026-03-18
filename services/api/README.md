# LifePass API Endpoints

## Profile DB
- Migration: `npm run db:migrate` (applies SQL files in `db/migrations/`)
- Legacy alias: `node scripts/migrate_profiles.js`
- Schema check: `npm run check:schema`
- Seed: `node scripts/seed_profiles.js` (adds demo users)

## Contract Deployment
- SBT: `node scripts/deploy_contract.js` (deploys LifePassSBT)
- Shortcut: `npm run deploy:sbt`
- Dry-run shortcut: `npm run deploy:sbt:dry`

Deployment gas strategy can be tuned with env vars (defaults shown):
- `DEPLOY_GAS_STRATEGY=auto` (`auto` or `provider`)
- `DEPLOY_GAS_PRICE_GWEI=` (optional manual override; takes precedence)
- `DEPLOY_MIN_GAS_PRICE_GWEI=` (optional floor)
- `DEPLOY_MAX_GAS_PRICE_GWEI=` (optional cap)
- `DEPLOY_INIT_GAS_RESERVE=250000` (gas units reserved during deploy preflight)
- `DEPLOY_BALANCE_BUFFER_POL=0.005` (POL kept as safety buffer)
- `DEPLOY_DRY_RUN=1` (preflight only, no on-chain tx)

Examples:

```powershell
# One-command auto mode (default)
npm run deploy:sbt

# Dry-run preflight only
npm run deploy:sbt:dry

# Provider-only strategy (no affordability cap)
$env:DEPLOY_GAS_STRATEGY='provider'; npm run deploy:sbt
```

## API Endpoints
- `POST /flow/mint` — Full flow: fetch profile, ZK proof, on-chain verify, mint SBT
- `POST /proof/generate` — Generate proof payload from `birthYear` (SNARKJS when enabled, simulated fallback otherwise)
- `POST /proof/verify-onchain` — Verify proof using on-chain contract (or fallback)
- `POST /sbt/mint` — Direct mint (requires contract configured)
- `POST /onboarding/signup` — Create profile with purpose/skills and verification docs
- `POST /onboarding/upload-url` — Generate upload intent + persist biometric/photo reference
- `GET /onboarding/media/:userId` — List profile media references
- `POST /onboarding/verify` — Approve/reject onboarding (API key protected)
- `POST /verifications/add` — Add endorsement/document/mutual verification (API key protected)
- `POST /verifications/revoke` — Revoke existing verification entry (API key protected)
- `GET /verifications/:userId` — Fetch verification events + summary metrics
- `POST /auth/sso/token` — Issue signed LifePass SSO token (API key protected)
- `POST /auth/sso/verify` — Verify LifePass SSO token
- `GET /pass/qr-payload/:userId` — Generate QR payload for mobile pass
- `GET /pass/qr/:userId` — Generate QR code data URL for LifePass pass
- `GET /portals/policy-matrix` — Read effective portal covenant policy matrix (API key protected)
	- `POST /portals/policy-matrix` — Update persisted policy overrides (API key + policy admin key)
	  - With `POLICY_TWO_PERSON_REQUIRED=1`, returns proposal id and waits for approvals
	- `POST /portals/policy-matrix/preview` — Preview matrix diff and route impacts without applying (API key + policy admin key)
	- `GET /portals/policy-snapshots?limit=50` — List policy snapshots (API key + policy admin key)
	- `POST /portals/policy-snapshots/:snapshotId/restore` — Restore policy from snapshot (API key + policy admin key)
	  - With `POLICY_TWO_PERSON_REQUIRED=1`, returns proposal id and waits for approvals
	- `GET /portals/policy-approvals?status=pending&limit=50` — List policy change proposals
	- `GET /portals/policy-approvals/:proposalId` — Read a policy change proposal
	- `POST /portals/policy-approvals/:proposalId/approve` — Submit signed approval (`approverId`, `signature`)
- `GET /portals/access-audit?limit=50` — Read recent portal access decisions (API key protected)
	- Filters: `decision`, `covenant`, `policyKey`, `userId`
	- Export: `format=csv`
	- `GET /portals/access-audit/alerts` — Covenant deny-spike alerts (`threshold`, `windowMinutes`) (API key + policy admin key)
	- `GET /portals/policy-admin/audit?limit=50` — Read policy admin update audit events (API key + policy admin key)
- `GET /portals/commons/me` — Return verified portal identity (Bearer token)
- `GET /portals/health/age-gated-services` — Silver+ route via portal policy
- `GET /users/:userId/dashboard` — Return profile + trust score
- `GET /trust/:userId` — Read trust score
- `POST /trust/:userId/update` — Update trust score (API key protected)
- `POST /ai/chat` — AI onboarding/navigation guide response
- `POST /embeddings/upsert` — Upsert embedding entry (API key protected)
- `POST /embeddings/query` — Semantic query against embedding store
- `GET /portals/*` and `POST /portals/agri/requests` — Multi-portal stubs

### Auth
- Set `API_KEY` env var and use `x-api-key` header for protected endpoints
- Portal protected routes use `Authorization: Bearer <lifepass-sso-token>`
- Portal trust policy defaults:
	- Bronze: `POST /portals/agri/requests`, `GET /portals/commons/me`
	- Silver: `GET /portals/agri/requests`, `GET /portals/health/age-gated-services`
- Override policy matrix with `LIFEPASS_PORTAL_POLICY_JSON` (JSON object keyed by covenant and policy key)
- Audit retention size is controlled by `PORTAL_ACCESS_AUDIT_MAX_ROWS` (default 2000, min 200)

### Environment
- `PG_CONNECTION_STRING` or `DATABASE_URL` for Postgres
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for managed profile/document storage integration
- `SUPABASE_STORAGE_BUCKET` for onboarding image uploads
- Optional S3 mode: `S3_BUCKET`, `S3_REGION` (API returns reference URL; external presign service can be attached)
- `RPC_URL`, `PRIVATE_KEY`, `SBT_CONTRACT_ADDRESS`, `AGE_VERIFIER_ADDRESS` for contract ops
- `REQUIRE_AGE_VERIFIER=1` to fail startup/readiness when `AGE_VERIFIER_ADDRESS` is missing/invalid
- Optional real ZK mode: set `USE_SNARKJS=1` and provide `SNARK_WASM_PATH`, `SNARK_ZKEY_PATH`, `SNARK_VKEY_PATH`
- `TRUST_SCORE_DEFAULT` for approved-user baseline trust score
- `OPENAI_API_KEY` for model-backed chat guide (current default is deterministic stub)
- `CORS_ALLOWED_ORIGINS` (comma-separated browser origin allowlist)
- `CORS_ALLOW_CREDENTIALS=1` only if cross-site credentials are required
- `STARTUP_STRICT=1` to fail fast on startup check failures
- `LIFEPASS_SSO_JWT_SECRET` to enable SSO issue/verify endpoints
- `LIFEPASS_SSO_JWT_ISSUER` (default `lifepass-api`)
- `LIFEPASS_SSO_DEFAULT_AUDIENCE` (default `zionstack-portals`)
- `LIFEPASS_SSO_JWT_EXPIRES_IN` (default `15m`)
- `LIFEPASS_PORTAL_POLICY_JSON` for covenant policy overrides (e.g. route trust thresholds)
- `PORTAL_ACCESS_AUDIT_MAX_ROWS` for portal decision log retention
- `POLICY_ADMIN_KEY` for legacy single-secret policy admin access
- `POLICY_ADMIN_KEYS_JSON` for rotated policy admin keys (key-id to secret map)
- `POLICY_ADMIN_ALLOWED_ACTORS` comma-separated allowlist for key-auth actors and admin JWT identities
- `POLICY_ADMIN_JWT_SECRET` to enable bearer-token policy admin access
- `POLICY_ADMIN_JWT_ISSUER`, `POLICY_ADMIN_JWT_AUDIENCE`, `POLICY_ADMIN_REQUIRED_ROLE` to constrain admin JWT validation
- `POLICY_ADMIN_AUDIT_MAX_ROWS` for policy admin audit retention
- `POLICY_SNAPSHOT_MAX_ROWS` for retained policy snapshots
- `PORTAL_DENY_ALERT_THRESHOLD` default deny-alert threshold (overridable via query)
- `PORTAL_DENY_ALERT_WINDOW_MINUTES` default deny-alert time window in minutes (overridable via query)
- `POLICY_TWO_PERSON_REQUIRED=1` to require signed multi-approver proposals before apply/restore
- `POLICY_REQUIRED_APPROVALS` approval threshold (minimum 2)
- `POLICY_APPROVAL_SIGNING_KEYS_JSON` JSON map of approver IDs to shared HMAC secrets
- `POLICY_APPROVAL_MAX_ROWS` for proposal retention
- `REQUIRE_DURABLE_GOVERNANCE=1` to require Postgres-backed admin/audit persistence and disable file fallback for governance stores
- `ALLOW_INSECURE_FILE_GOVERNANCE=1` only as a temporary break-glass override if production must boot without durable governance

### Two-Person Approval Signing

Do not place approval shared secrets in the browser admin UI. Generate signatures offline instead:

```powershell
cd services/api
npm run sign:approval -- --proposal-id <proposal-id> --action <proposal-action> --payload-hash <payload-hash> --secret <approver-shared-secret>
```

The signing message format is:

```text
<proposalId>:<action>:<payloadHash>
```

Use `--json true` if you want the helper to print the full message and signature payload.

### Health & Startup Checklist
- `GET /health` returns startup/env readiness checks.
- On process start, checklist status is logged.
- With `STARTUP_STRICT=1`, startup exits if any critical check fails.
- `GET /portals/policy-admin/audit/export` returns a tamper-evident hash-chain export of policy admin events.
- `GET /portals/access-audit/export` returns a tamper-evident hash-chain export of portal access decisions.

## Deploy API On Render / Railway

Set service root to `services/api` and use:

- Build command: `npm install`
- Start command: `npm start`
- In production, set `NODE_ENV=production`, attach Postgres via `DATABASE_URL` or `PG_CONNECTION_STRING`, and leave `ALLOW_INSECURE_FILE_GOVERNANCE` unset.
- `REQUIRE_DURABLE_GOVERNANCE=1` remains the preferred explicit production setting, but the API now also fails closed by default in production if governance durability is not configured.

Post-deploy verification sequence:

```powershell
cd services/api
npm run db:migrate
npm run check:governance-db
powershell -ExecutionPolicy Bypass -File ..\scripts\check-render-health.ps1 -ApiBaseUrl https://lifepass-api.onrender.com
```

Expected outcome after the latest API build is deployed:

- `/health` reports `healthSchemaVersion: 2`
- `/health` includes `Durable governance storage`
- `Durable governance storage` is `PASS`
- `npm run check:governance-db` reports all governance/audit tables present

Recommended environment variables:

- `NODE_ENV=production`
- `PORT` (platform may inject this automatically)
- `API_KEY` (recommended)
- `STARTUP_STRICT=1`
- `CORS_ALLOWED_ORIGINS=https://<your-vercel-domain>`
- `CORS_ALLOW_CREDENTIALS=0`
- `RPC_URL`
- `PRIVATE_KEY`
- `SBT_CONTRACT_ADDRESS`
- `AGE_VERIFIER_ADDRESS` (optional)

Post-deploy checks:

```bash
curl https://<api-domain>/health
```

Expected: `success: true`, `hasCriticalFailure: false`.

Validate SNARK artifacts/config explicitly:

```powershell
cd services/api
npm run validate:snark
```

## Mode Switching & Readiness Checklist

Use the repository script to validate or apply environment mode in one command:

Testnet env quick-start:

```powershell
# 1) Seed testnet env files from templates
Copy-Item .\services\api\.env.testnet.example .\services\api\.env.local -Force
Copy-Item .\apps\web\.env.testnet.example .\apps\web\.env.local -Force

# 2) Edit both .env.local files with real values
```

If deployer balance is too low on Amoy, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\request-faucet.ps1
```

See `docs/FUNDING.md` for full instructions.

```powershell
# Validate simulated mode readiness
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-readiness.ps1 -Mode simulated

# Validate testnet mode readiness
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-readiness.ps1 -Mode testnet

# Apply simulated mode (writes services/api/.env.local and apps/web/.env.local)
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-readiness.ps1 -Mode simulated -Apply

# Apply testnet mode after setting required secrets
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-readiness.ps1 -Mode testnet -Apply
```

Run companion smoke checks (starts API, runs tests, then stops API):

```powershell
# Strict testnet check (fails if /sbt/mint is still simulated)
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-smoke.ps1 -Mode testnet

# Simulated/local check
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-smoke.ps1 -Mode simulated

# Optional: skip masked config preflight output
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-smoke.ps1 -Mode testnet -SkipPreflight

# Preflight-only (safe missing/invalid config report, no API start, no smoke)
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-smoke.ps1 -Mode testnet -SkipApply -PreflightOnly
```

In strict testnet mode, the script now also verifies that `SBT_CONTRACT_ADDRESS` has deployed bytecode on the configured `RPC_URL` before API startup.

If `REQUIRE_AGE_VERIFIER=1`, readiness/startup strict checks also require a valid `AGE_VERIFIER_ADDRESS` and fail fast when it is missing.

If `USE_SNARKJS=1`, preflight/readiness checks also require valid `SNARK_WASM_PATH`, `SNARK_ZKEY_PATH`, and `SNARK_VKEY_PATH` values.
During `scripts/testnet-smoke.ps1`, `npm run validate:snark` is also executed before endpoint smoke tests when `USE_SNARKJS=1`.
