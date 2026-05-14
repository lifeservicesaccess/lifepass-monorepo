# Render Remediation Checklist - 2026-03-20

Use this checklist to bring `lifepass-api` on Render up to the current repository production standard.

Current known state:
- Render service is reachable at `https://lifepass-api.onrender.com`
- Basic mint env checks pass
- Hosted `/health` is stale: `HealthSchema: unknown`
- Hosted `/health` is missing `Durable governance storage`
- Local strict testnet smoke already passes, so the remaining gap is hosted parity

Current follow-up as of 2026-05-14:
- `GET https://lifepass-api.onrender.com/health` returns HTTP `503`
- Render response includes `x-render-routing: suspend`
- Response body says `Service Suspended`
- Hosted parity is blocked until the Render service/account is restored

## Success Criteria

Do not stop until all of these are true:

0. Render no longer returns `Service Suspended` for the hosted API.
1. `scripts/check-render-health.ps1` returns no critical findings.
2. Hosted `/health` includes `Durable governance storage`.
3. Hosted `Durable governance storage` is `PASS`.
4. Hosted `/health` no longer reports `HealthSchema: unknown`.
5. The deployed Render build matches the current repo expectations.

## Step 1: Confirm The Service You Are Fixing

In Render dashboard:

1. Open the service `lifepass-api`.
2. Confirm the service URL is `https://lifepass-api.onrender.com`.
3. Open `Deploys` or `Events`.
4. Check whether the latest deploy commit matches the current repo head.

If the public endpoint shows `Service Suspended`, resolve the Render suspension first. Do not spend time debugging app code, environment variables, or governance migrations until the service can receive traffic again.

Decision:
- If the latest deploy is older than current repo work, treat the problem as stale deployment first.
- If the latest deploy is current, continue to environment and DB verification.

## Step 2: Snapshot Current Hosted Health

Run from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-render-health.ps1 -ApiBaseUrl https://lifepass-api.onrender.com
```

Expected current finding:
- `critical: Durable governance storage check missing`

Also fetch the raw payload:

```powershell
Invoke-RestMethod -Uri "https://lifepass-api.onrender.com/health" -Method Get -TimeoutSec 30 | ConvertTo-Json -Depth 10
```

Record:
- current `HealthSchema`
- whether `Durable governance storage` exists
- whether `hasCriticalFailure` is true or false

## Step 3: Verify Render Environment Variables

In Render dashboard, open `lifepass-api` -> `Environment`.

Verify these are present and correct:

Required:
- `NODE_ENV=production`
- `STARTUP_STRICT=1`
- `DATABASE_URL` attached from `lifepass-db`
- `REQUIRE_DURABLE_GOVERNANCE=1`
- `API_KEY`
- `CORS_ALLOWED_ORIGINS`
- `RPC_URL`
- `PRIVATE_KEY`
- `SBT_CONTRACT_ADDRESS`
- `LIFEPASS_SSO_JWT_SECRET`

Recommended for current repo standard:
- `CORS_ALLOW_CREDENTIALS=0`
- `LIFEPASS_SSO_JWT_ISSUER=lifepass-api`
- `LIFEPASS_SSO_DEFAULT_AUDIENCE=zionstack-portals`
- `POLICY_TWO_PERSON_REQUIRED=1`
- `POLICY_REQUIRED_APPROVALS=2`

Conditional, depending on your intended production posture:
- `TRUST_REGISTRY_ADDRESS`
- `AGE_VERIFIER_ADDRESS`
- `REQUIRE_AGE_VERIFIER=1` if verifier contract must be mandatory
- exactly one admin auth mode: `POLICY_ADMIN_KEY` or `POLICY_ADMIN_KEYS_JSON` or `POLICY_ADMIN_JWT_SECRET`
- `POLICY_APPROVAL_SIGNING_KEYS_JSON` if two-person approvals are enabled

Decision:
- If `DATABASE_URL` is missing or not attached from Render Postgres, fix that before doing anything else.
- If `REQUIRE_DURABLE_GOVERNANCE` is not `1`, fix that before redeploy.
- If `ALLOW_INSECURE_FILE_GOVERNANCE` is set, remove it unless you are intentionally in break-glass mode.
- If both key-mode and JWT-mode policy admin env vars are set, remove one mode before redeploy.

## Step 4: Redeploy The Current API Build

In Render dashboard:

1. Trigger a redeploy for `lifepass-api`.
2. Wait for the deploy to complete.
3. If deploy fails, inspect the first fatal error in `Logs` before continuing.

If the deploy does not appear to pick up the latest repo state:

1. Confirm the connected branch is correct.
2. Confirm Render is building from `services/api` as defined in [render.yaml](render.yaml).
3. Trigger another deploy after confirming the latest commit is available to Render.

## Step 5: Run Governance DB Checks Against Production Wiring

This must be done against the deployed production database configuration.

From the appropriate execution environment for the Render service:

```powershell
cd services/api
npm run db:migrate
npm run check:governance-db
```

Expected result:
- migrations succeed
- governance DB check reports required tables present

Do not treat rollout as complete if either command fails.

## Step 6: Re-Run Hosted Health Audit

From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-render-health.ps1 -ApiBaseUrl https://lifepass-api.onrender.com
```

Expected result after remediation:
- no critical findings
- `HealthSchema` is not `unknown`
- `Durable governance storage` exists and is `PASS`

Also re-check the raw payload:

```powershell
Invoke-RestMethod -Uri "https://lifepass-api.onrender.com/health" -Method Get -TimeoutSec 30 | ConvertTo-Json -Depth 10
```

Confirm the payload now includes:
- `Durable governance storage`
- current governance-related checks expected by the repo

## Step 7: Verify Mint And Web Integration Assumptions

After health passes, verify the surrounding production contract.

In Render:
- confirm `API_KEY` remains set
- confirm `CORS_ALLOWED_ORIGINS` includes the deployed web origin

In the hosted web app:
- confirm `API_BASE_URL=https://lifepass-api.onrender.com`
- confirm server-side `API_KEY` matches the Render API key

This avoids a situation where Render is healthy but the web app still calls stale or misconfigured upstreams.

## Step 8: Record The Outcome

Once remediation is complete, record:

1. deployed commit SHA
2. Render deploy timestamp
3. result of `scripts/check-render-health.ps1`
4. whether `Durable governance storage` is `PASS`
5. whether `AGE_VERIFIER_ADDRESS` remains optional or is now enforced

Recommended repo update targets:
- [docs/render-hosted-audit-2026-03-20.md](docs/render-hosted-audit-2026-03-20.md)
- [docs/blueprint-alignment-backlog.md](docs/blueprint-alignment-backlog.md)

## Stop Conditions

Stop and escalate if any of these happen:

1. Render keeps serving `HealthSchema: unknown` after a confirmed latest-code redeploy.
2. `DATABASE_URL` is attached but `npm run check:governance-db` still fails.
3. `Durable governance storage` appears but reports `FAIL` after migration and redeploy.
4. Logs show the service is still running behavior older than the current repo after a clean redeploy.

## One-Command Verification Pair

Use these two commands together after every attempted fix:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-render-health.ps1 -ApiBaseUrl https://lifepass-api.onrender.com
Invoke-RestMethod -Uri "https://lifepass-api.onrender.com/health" -Method Get -TimeoutSec 30 | ConvertTo-Json -Depth 10
```
