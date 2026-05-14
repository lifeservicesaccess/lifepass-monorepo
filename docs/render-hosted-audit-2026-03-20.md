# Render Hosted Audit - 2026-03-20

Target service:
- `https://lifepass-api.onrender.com`

Audit basis:
- Repo helper `scripts/check-render-health.ps1`
- Direct `GET /health`
- Render production contract defined in [docs/deployment-env-checklist.md](docs/deployment-env-checklist.md)
- Governance rollout expectations defined in [docs/governance-operations-runbook.md](docs/governance-operations-runbook.md)

## Result

Render is reachable and serving production traffic, but it is not yet verified against the current repo production standard.

The main finding is not an outage. The main finding is a stale or incomplete production rollout.

## Follow-Up - 2026-05-14

The hosted API is currently not available for parity verification.

Observed from `GET https://lifepass-api.onrender.com/health` using Node HTTPS:
- HTTP status: `503`
- `x-render-routing`: `suspend`
- body title: `Service Suspended`

Interpretation:
- M2 hosted parity is blocked before health-schema or durable-governance checks can run.
- Treat this as a Render account/service restoration issue first, not an application health-schema issue.
- After the service is unsuspended and responding, rerun `scripts/check-render-health.ps1` and continue the durable governance checks below.

## What Passed

- `NODE_ENV`: `production`
- `CORS_ALLOWED_ORIGINS configured`: pass
- `API_KEY set`: pass
- `PRIVATE_KEY format`: pass
- `SBT_CONTRACT_ADDRESS format`: pass
- `On-chain mint mode`: pass

This means the hosted API is not under-configured at the basic blockchain mint path level.

## What Failed Or Drifted

### 1. Health schema is stale

Observed from Render audit output:
- `Version: unknown`
- `HealthSchema: unknown`

Observed from direct `/health` payload:
- only 7 checks are present
- no governance-hardening checks are exposed

Interpretation:
- the deployed API is not running the current repo health schema
- treat this as a stale build or incomplete production rollout until proven otherwise

### 2. Durable governance verification is missing

Repo health audit result:
- `critical: Durable governance storage check missing`

Interpretation:
- the deployed API does not expose the `Durable governance storage` check expected by the current repo
- production cannot be verified as governance-hardened yet

### 3. Production age verifier is still optional

Observed from direct `/health` payload:
- `AGE_VERIFIER_ADDRESS format`: warn
- detail: `optional; not set`

Interpretation:
- this is not necessarily broken
- it is below the stricter recommended production posture where `REQUIRE_AGE_VERIFIER=1`

## Hosted Gap List

### RENDER-001 Redeploy latest API build

Problem:
- Render appears to be serving a build older than the current repo governance-hardening expectation.

Acceptance criteria:
- `/health` no longer reports `HealthSchema: unknown`
- `/health` includes `Durable governance storage`

### RENDER-002 Confirm Postgres-backed governance wiring

Problem:
- production governance cannot be verified without current health checks and DB-backed governance state.

Expected Render env state:
- `DATABASE_URL` attached from `lifepass-db`
- `REQUIRE_DURABLE_GOVERNANCE=1`
- `ALLOW_INSECURE_FILE_GOVERNANCE` unset unless in temporary break-glass mode

Acceptance criteria:
- `Durable governance storage` reports `PASS`
- no production deployment depends on insecure file fallback

### RENDER-003 Run governance DB validation after redeploy

Problem:
- durable governance rollout is incomplete until schema verification is run against production DB.

Commands:

```powershell
cd services/api
npm run db:migrate
npm run check:governance-db
cd ..
powershell -ExecutionPolicy Bypass -File .\scripts\check-render-health.ps1 -ApiBaseUrl https://lifepass-api.onrender.com
```

Acceptance criteria:
- governance DB check reports required tables present
- hosted health audit returns no critical findings

### RENDER-004 Decide whether production should require verifier contract strictly

Problem:
- Render is currently running with `AGE_VERIFIER_ADDRESS` unset.

Acceptance criteria:
- if strict verifier mode is required, set `REQUIRE_AGE_VERIFIER=1` and a valid `AGE_VERIFIER_ADDRESS`
- if optional mode is intentional, record that as an explicit production decision

## Raw Hosted Health Snapshot

As observed on 2026-03-20, the hosted payload included only:

- `NODE_ENV`
- `CORS_ALLOWED_ORIGINS configured`
- `API_KEY set`
- `PRIVATE_KEY format`
- `SBT_CONTRACT_ADDRESS format`
- `On-chain mint mode`
- `AGE_VERIFIER_ADDRESS format`

This is the strongest evidence that Render is behind the repo's current production contract.

## Recommended Operator Sequence

1. Open Render service `lifepass-api`.
2. Confirm latest deployed commit matches current repo head.
3. Redeploy the latest API build.
4. Confirm `DATABASE_URL` is attached and `REQUIRE_DURABLE_GOVERNANCE=1` is present.
5. Run governance migrations and DB checks.
6. Re-run `scripts/check-render-health.ps1`.
7. Do not treat Render as fully production-ready until the durable governance check exists and passes.
