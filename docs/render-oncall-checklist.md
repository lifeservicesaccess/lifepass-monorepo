# Render On-Call Checklist

Use this one-page checklist when `lifepass-api` is failing on Render.

Primary goal: decide quickly whether the issue is a build failure, startup/config failure, health-check failure, or runtime regression.

## 1. Confirm Service And Latest Deploy

In the Render dashboard:

1. Open your workspace.
2. Open the web service `lifepass-api`.
3. Open the `Events` or `Deploys` tab.
4. Check the latest deploy status.

Interpretation:

- If the latest deploy failed before the service started, this is a build or boot failure.
- If the latest deploy succeeded but traffic is failing, this is a runtime or config issue.
- If the latest deploy is old and behavior does not match the repo, suspect a stale deployment.

## 2. Check Health First

Run the repo helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-render-health.ps1 -ApiBaseUrl https://lifepass-api.onrender.com
```

If you prefer manual inspection:

1. In the Render dashboard, open `lifepass-api`.
2. Open the `Shell` or `Logs` view if available, or use your browser/Postman.
3. Request `https://<your-api-domain>/health`.

Interpretation:

- `hasCriticalFailure: true` means startup config is incomplete for production.
- A missing or invalid checklist item usually points directly to the env var that needs fixing.
- `HealthSchema: unknown` or a missing `Durable governance storage` check means the deployed API is stale and not running the current governance-hardening build.

## 3. Fix Critical Env Failures In Render Dashboard

In the Render dashboard:

1. Open `lifepass-api`.
2. Open `Environment`.
3. Compare the failing `/health` checks to these env vars.

Most important mappings:

- `CORS_ALLOWED_ORIGINS configured` -> set `CORS_ALLOWED_ORIGINS` to the deployed web origin.
- `API_KEY set` -> set `API_KEY` on Render and the same `API_KEY` in the hosted web app.
- `PRIVATE_KEY format` -> replace `PRIVATE_KEY` with a valid `0x...` signer key.
- `SBT_CONTRACT_ADDRESS format` -> set deployed `SBT_CONTRACT_ADDRESS`.
- `TRUST_REGISTRY_ADDRESS format` -> set deployed `TRUST_REGISTRY_ADDRESS`.
- `AGE_VERIFIER_ADDRESS format` -> set valid `AGE_VERIFIER_ADDRESS`.
- `On-chain mint mode` warning -> verify `RPC_URL`, `PRIVATE_KEY`, and `SBT_CONTRACT_ADDRESS` are all present.
- `On-chain action anchoring mode` warning -> verify `RPC_URL`, `PRIVATE_KEY`, and `TRUST_REGISTRY_ADDRESS` are all present.
- `LIFEPASS_SSO_JWT_SECRET configured` -> set `LIFEPASS_SSO_JWT_SECRET`.
- `Policy admin auth mode` -> set one of `POLICY_ADMIN_KEY`, `POLICY_ADMIN_KEYS_JSON`, or `POLICY_ADMIN_JWT_SECRET`.
- `Durable governance storage` -> confirm `DATABASE_URL` is attached from Render Postgres and `REQUIRE_DURABLE_GOVERNANCE=1` remains set.
- `POLICY_TWO_PERSON_REQUIRED readiness` -> set `POLICY_APPROVAL_SIGNING_KEYS_JSON` and `POLICY_REQUIRED_APPROVALS`, or disable `POLICY_TWO_PERSON_REQUIRED`.

After editing env vars in Render:

1. Click `Save Changes`.
2. Let Render trigger a redeploy, or manually redeploy if needed.
3. Re-run the health helper.

## 4. If Build Or Boot Failed, Inspect Logs In Order

In the Render dashboard:

1. Open `lifepass-api`.
2. Open `Logs`.
3. Filter to the latest deploy window.
4. Look for the first fatal error, not the last repeated error.

Common first-stop signatures:

- `STARTUP_STRICT=1 and one or more startup checks failed. Exiting.`
- `Migration failed:`
- `Set PG_CONNECTION_STRING or DATABASE_URL`
- missing or invalid address format messages from the startup checklist

Use [docs/render-log-playbook.md](docs/render-log-playbook.md) to map signatures to likely fixes.

## 5. Verify Database Wiring

In the Render dashboard:

1. Open the Postgres instance `lifepass-db`.
2. Confirm it is available and healthy.
3. Open `lifepass-api` -> `Environment`.
4. Confirm `DATABASE_URL` is populated from the managed database connection string.

If schema-dependent API paths fail after provisioning:

1. Open `lifepass-api`.
2. Use a Render shell or one-off job approach.
3. Run `npm run db:migrate` from `services/api`.
4. Run `npm run check:governance-db` from `services/api` to confirm the governance, audit, and milestone tables exist.

## 6. Check Web-To-API Integration

For minting issues, verify both Render and the hosted web app.

In Render dashboard for `lifepass-api`:

1. Confirm `API_KEY` exists.
2. Confirm `CORS_ALLOWED_ORIGINS` includes the deployed web origin.

In the web host dashboard:

1. Confirm `API_KEY` exists for the Next.js `/api/mint` proxy.
2. Confirm `API_BASE_URL` or `NEXT_PUBLIC_API_BASE_URL` points at the live API.
3. Redeploy the web app after env changes.

If the UI still shows old error payloads after deploy:

1. Return to Render `Deploys`.
2. Confirm the latest commit actually deployed.
3. Trigger a manual redeploy if needed.

## 7. Quick Runtime Triage

If the service is healthy but requests are failing:

1. Check `/health` again.
2. Inspect request logs around the failing endpoint.
3. Match the error body against [docs/render-log-playbook.md](docs/render-log-playbook.md).

High-frequency cases:

- `Origin not allowed by CORS policy`
- `Unauthorized`
- `Proof verification failed`
- `On-chain mint failed: ...`
- `Error minting token: ...`
- `Failed to issue SSO token`

## 8. Render MCP Fallback

If you want AI-assisted triage inside Cursor or Claude Code:

1. Connect the Render MCP server using [docs/render-mcp.md](docs/render-mcp.md).
2. Ask:

```text
Show the latest failed deploy for lifepass-api and summarize the first fatal error
```

Then follow with:

```text
Match the failure to the repo's Render log playbook and tell me the first Render environment variable or dashboard setting to fix
```
