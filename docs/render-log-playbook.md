# Render Log Playbook

This is a short repo-local troubleshooting map for common Render log signatures and failure symptoms in the LifePass stack.

Use it when `lifepass-api` fails to build, boot, pass health checks, or serve requests.

For a step-by-step incident runbook, see [docs/render-oncall-checklist.md](docs/render-oncall-checklist.md).

## Fast Triage Order

1. Check whether the failure is build-time or runtime.
2. If the service booted, inspect `GET /health`.
3. If `STARTUP_STRICT=1` is enabled, fix startup checklist failures before looking deeper.
4. If the service is healthy but requests fail, match the request error body or log line below.

## Signature Map

| Log signature or symptom | Likely cause | Likely fix |
| --- | --- | --- |
| `STARTUP_STRICT=1 and one or more startup checks failed. Exiting.` | Render started the API, but one or more required startup checks failed. | Call `/health` or inspect startup checklist lines immediately above this error. Fix the failing env vars first. |
| `CORS_ALLOWED_ORIGINS configured: not set; browser cross-origin requests will be blocked` | Production API is missing the browser origin allowlist. | Set `CORS_ALLOWED_ORIGINS` to the deployed web origin, for example the Vercel domain. |
| `API_KEY set: not set; protected endpoints are open` | Backend API key was not configured. This is a production security gap and breaks the intended web proxy flow. | Set `API_KEY` on Render and the same value in the hosted web app for the Next.js `/api/mint` proxy. |
| `PRIVATE_KEY format: expected 0x-prefixed 64-byte hex key` | The configured signer key is malformed. | Replace `PRIVATE_KEY` with a valid `0x...` 64-byte hex private key. |
| `SBT_CONTRACT_ADDRESS format: invalid address format` | The mint contract address env var is missing or malformed. | Set `SBT_CONTRACT_ADDRESS` to the deployed LifePassSBT address on Amoy. |
| `TRUST_REGISTRY_ADDRESS format: invalid address format` | Trust registry anchoring env is missing or malformed. | Set `TRUST_REGISTRY_ADDRESS` to the deployed LifePassTrustRegistry address. |
| `AGE_VERIFIER_ADDRESS format: invalid address format` | The verifier contract address is malformed. In production this can block strict startup. | Set `AGE_VERIFIER_ADDRESS` to a valid verifier contract address. |
| `On-chain mint mode: incomplete config; /sbt/mint will simulate` | At least one of `RPC_URL`, `PRIVATE_KEY`, or `SBT_CONTRACT_ADDRESS` is missing. | Set all three values on Render if you want real minting instead of simulation. |
| `On-chain action anchoring mode: incomplete config; milestone anchors will simulate` | At least one of `RPC_URL`, `PRIVATE_KEY`, or `TRUST_REGISTRY_ADDRESS` is missing. | Set all three values if milestone anchoring must be on-chain. |
| `LIFEPASS_SSO_JWT_SECRET configured: not set; /auth/sso/token and /auth/sso/verify return 503` | SSO secret is missing. | Set `LIFEPASS_SSO_JWT_SECRET` and redeploy. |
| `enabled; 0 approver key(s) configured (required 2)` under `POLICY_TWO_PERSON_REQUIRED readiness` | Two-person policy approval mode is enabled without enough approval keys. | Set `POLICY_APPROVAL_SIGNING_KEYS_JSON` and `POLICY_REQUIRED_APPROVALS` correctly, or disable `POLICY_TWO_PERSON_REQUIRED`. |
| HTTP `403` with `Origin not allowed by CORS policy` | Browser origin is not in `CORS_ALLOWED_ORIGINS`. | Add the exact deployed frontend origin and redeploy the API. |
| HTTP `401` with `Unauthorized` on protected routes | Wrong or missing `x-api-key`. | Ensure the caller uses the Render `API_KEY`. For the web mint flow, confirm the hosted Next app has `API_KEY` configured server-side. |
| HTTP `400` with `Missing proof or publicSignals` | `/proof/submit` was called with an incomplete request body. | Ensure the caller sends both `proof` and `publicSignals`. |
| HTTP `400` with `Invalid proof format` | Proof bytes are not in accepted format. | Send a `0x...` hex proof string, `Uint8Array`, or byte array. |
| HTTP `400` with `Proof verification failed` and reason `verifier not configured in production` | Production proof verification is running without a configured verifier contract. | Set `RPC_URL` and `AGE_VERIFIER_ADDRESS`, then redeploy. |
| HTTP `400` with `Invalid recipient wallet address` | `/sbt/mint` received a bad destination address. | Validate the wallet address before calling mint. |
| HTTP `502` with `On-chain mint failed: ...` | The contract call reached the chain but reverted or the signer/provider failed. | Inspect the returned `reason`. Common fixes are wrong contract address, missing verifier role, insufficient gas balance, or RPC/provider issues. |
| HTTP `500` with `Error minting token: ...` | Unhandled mint failure in the API. | Look at the `reason` field and any preceding `sbt/mint error` log entry. Compare the deployed behavior with the current repo code to rule out a stale Render deploy. |
| `wallet.mintSbt error (ethers):` followed by `insufficient funds` | The configured signer wallet does not have enough POL for gas. | Fund the signer wallet on Amoy and retry. |
| `wallet.mintSbt error (ethers):` followed by a contract revert or RPC error | Chain-side mint path failed and wallet tool fell back to simulation. | Verify `RPC_URL`, contract address, signer permissions, and network health. |
| `Set PG_CONNECTION_STRING or DATABASE_URL` | Migration or DB script ran without a database connection string. | Ensure Render injects `DATABASE_URL` from the managed Postgres instance. |
| `Migration failed:` | SQL migration execution failed. | Check the specific SQL error, verify `DATABASE_URL`, and rerun `npm run db:migrate`. |
| Health check passes but responses still look old, for example old `Error minting token` payload shape | Render is likely serving stale code or an old deploy. | Confirm the latest commit is deployed, inspect deploy history, and force a redeploy if needed. |
| HTTP `500` with `Failed to issue SSO token` | SSO signing failed, usually because the JWT secret is missing or invalid. | Set `LIFEPASS_SSO_JWT_SECRET` and confirm issuer/audience env vars if customized. |
| HTTP `401` with `Missing portal bearer token` | A portal endpoint requiring SSO bearer auth was called without a token. | Supply `Authorization: Bearer <lifepass-sso-token>`. |
| HTTP `401` with `Invalid portal bearer token` | Portal SSO token is expired, malformed, or signed with the wrong secret. | Re-issue the token from the same environment and verify `LIFEPASS_SSO_JWT_SECRET` consistency. |
| HTTP `403` with `Forbidden: invalid policy admin key` | Policy admin endpoint received the wrong admin secret. | Set and use the correct `POLICY_ADMIN_KEY`. |
| HTTP `500` with `Failed to generate pass payload`, `Failed to generate NFC pass payload`, or `Failed to generate QR pass` | Pass generation failed due to bad profile state or storage/helper failure. | Check the target user profile exists and inspect upstream profile/storage errors in the logs. |

## Render MCP Prompts That Pair Well With This Playbook

- `Show the latest failed deploy for lifepass-api and summarize the first fatal error`
- `Pull recent error-level logs for lifepass-api and match them to the repo's Render log playbook`
- `Inspect lifepass-api health output and tell me which startup checklist item is blocking boot`
- `Look for /sbt/mint failures and classify them as env misconfiguration, RPC failure, contract revert, or stale deploy`

## Repo Anchors

- Startup checklist and `/health`: `services/api/index.js`
- Mint path: `services/api/index.js` and `services/api/tools/wallet.js`
- Proof verification path: `services/api/tools/onchainVerifier.js`
- Migrations: `services/api/scripts/run_migrations.js`
