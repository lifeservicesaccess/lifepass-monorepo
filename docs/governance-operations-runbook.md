# Governance Operations Runbook

This runbook covers the practical operator flow for LifePass policy governance in local, staging, and production-like environments.

## Admin Modes

- Rotated key mode uses `POLICY_ADMIN_KEYS_JSON` plus `x-policy-admin-key-id` and `x-policy-admin-key`.
- JWT mode uses `POLICY_ADMIN_JWT_SECRET` plus a bearer token with a role accepted by `POLICY_ADMIN_REQUIRED_ROLE`.
- `POLICY_ADMIN_ALLOWED_ACTORS` should constrain both key-mode actors and JWT identities.

## Local Validation Baseline

- Keep `REQUIRE_DURABLE_GOVERNANCE=0` until Postgres is configured.
- Use `/admin` for operator review, previews, proposal creation, snapshots, audit browsing, and audit export.
- Do not enter approver shared secrets into the browser.
- Use the execution-mode banner in `/admin` as the first check before changing policy. It should tell the operator whether actions will execute immediately or create proposals, which admin auth mode is active, and whether governance is still using file fallback.

## Two-Person Approval Flow

1. Load the admin console and verify health shows the expected admin auth mode.
2. Submit a policy update or snapshot restore.
3. With `POLICY_TWO_PERSON_REQUIRED=1`, confirm the API returns a `proposalId` instead of applying immediately.
4. Open the Approvals section in `/admin` and select the target proposal.
5. Copy the signing message or offline signing command from the helper block.
6. Each approver generates a signature offline with their own shared secret.
7. Submit `approverId` and `signature` through `/admin` or directly to `POST /portals/policy-approvals/:proposalId/approve`.
8. Confirm the first approval remains `pending` and the threshold approval changes status to `executed`.

## Operator Copy Shortcuts

- `/admin` can copy the approval signing message for a selected proposal.
- `/admin` can copy the offline `npm run sign:approval` command for the selected proposal.
- Snapshot rows expose a `Copy ID` shortcut to reduce restore errors.
- Audit export panels expose `Copy Root Hash` after export so operators can preserve the hash in change records.

## Offline Signing Helper

Use the local helper from `services/api`:

```powershell
cd services/api
npm run sign:approval -- --proposal-id <proposal-id> --action <proposal-action> --payload-hash <payload-hash> --secret <approver-shared-secret>
```

The signed message is:

```text
<proposalId>:<action>:<payloadHash>
```

Use `--json true` if the operator wants the helper to print the message and signature together.

## Audit Handling

- `GET /portals/policy-admin/audit/export` returns a hash-chained export of policy admin events.
- `GET /portals/access-audit/export` returns a hash-chained export of portal access events.
- Export after material governance actions and preserve the resulting `rootHash` in change records.

## Durable Governance Rollout

Production now defaults to durable governance. File fallback in production should be treated as a temporary break-glass exception only.

1. Provision Postgres and set `DATABASE_URL` or `PG_CONNECTION_STRING`.
2. Run `npm run db:migrate` from `services/api`.
3. Restart the API and confirm `/health` reports Postgres-backed governance storage.
4. Verify policy snapshots, approvals, policy admin audit, and access audit can all be read and written.
5. Set `REQUIRE_DURABLE_GOVERNANCE=1`.
6. Restart again and confirm `/health` no longer reports file fallback.
7. Run a full governance workflow: preview, propose, approve, execute, snapshot list, restore, and both audit exports.
8. Only after that should the environment be treated as durable-governance ready.

If production absolutely must boot before Postgres is restored, set `ALLOW_INSECURE_FILE_GOVERNANCE=1` as a temporary exception, record the incident, and remove it immediately after durable storage is healthy again.

Exact verification sequence after redeploy:

```powershell
cd services/api
npm run db:migrate
npm run check:governance-db
cd ..
powershell -ExecutionPolicy Bypass -File .\scripts\check-render-health.ps1 -ApiBaseUrl https://lifepass-api.onrender.com
```

Treat the rollout as incomplete if any of the following are true:

- `check-render-health.ps1` reports `HealthSchema: unknown`
- `check-render-health.ps1` reports `Durable governance storage check missing`
- `Durable governance storage` is not `PASS`
- `npm run check:governance-db` reports missing tables

## Production Notes

- Prefer JWT admin mode for user identity and key rotation discipline.
- Keep approval shared secrets outside the web tier.
- Rotate policy admin keys and approver secrets independently.
- Preserve exported audit root hashes with release or incident records.