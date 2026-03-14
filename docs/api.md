# API Documentation

The LifePass backend exposes a REST API for interacting with the smart contracts and zero‑knowledge proofs.  This document describes the available endpoints and their expected inputs and outputs.

## Base URL

By default, the API server runs on `http://localhost:3003`.  When deploying to production, configure the `PORT`, `RPC_URL`, `PRIVATE_KEY` and contract addresses via environment variables.

If `REQUIRE_AGE_VERIFIER=1` and `STARTUP_STRICT=1`, startup fails when `AGE_VERIFIER_ADDRESS` is missing or invalid.

For browser access from the deployed web app, configure `CORS_ALLOWED_ORIGINS` as a comma-separated allowlist (for example `https://your-web.vercel.app`).

## Health

### GET `/health`

Returns startup checklist diagnostics (CORS setup, key/address formats, on-chain config completeness).

Use this endpoint as the first post-deploy check on Render/Railway.

## Endpoints

### POST `/proof/submit`

Submit a zero‑knowledge proof of the over‑18 predicate.

**Request Body**

```
{
  "proof": { /* SNARK proof object */ },
  "publicSignals": {
    "is_over_18": 1
  }
}
```

**Response**

```
{
  "success": true,
  "message": "Proof verified"
}
```

If verification fails, the server returns `success: false` with an `error` message.

### POST `/sbt/mint`

Mint a new LifePass soulbound token.  Requires that a proof has been previously submitted (enforced off‑chain in the current demo).

When blockchain configuration is missing (`RPC_URL`, `PRIVATE_KEY`, `SBT_CONTRACT_ADDRESS`), the API gracefully simulates minting in local/dev mode and returns `success: true` with `simulated: true`.

**Request Body**

```
{
  "to": "0xRecipientAddress",
  "tokenId": 12345,
  "metadata": {
    "purpose": "LifePass",
    "trustScore": 0,
    "verificationLevel": "Silver",
    "didUri": ""
  }
}
```

**Response**

```
{
  "success": true,
  "txHash": "0x…"
}
```

Example simulated response (dev fallback):

```
{
  "success": true,
  "txHash": "0xSIMULATED_SBT_MINT_...",
  "simulated": true,
  "message": "SBT contract not configured; mint simulated"
}
```

Error responses include `success: false` and an `error` field.

### POST `/onboarding/signup`

Create a user onboarding record with purpose, skills and verification docs.

Supports Sprint 1 identity fields:

- `legalName`
- `preferredCovenantName` (or legacy `covenantName`)
- `biometricPhotoRef` and `biometricPhotoUrl` (optional)

### POST `/onboarding/upload-url`

Creates an upload intent for biometric/photo files and stores the media reference on the profile.

### GET `/onboarding/media/:userId`

Lists media references associated with a profile.

### POST `/verifications/add`

Protected by `x-api-key`. Adds verification events for:

- `endorsement`
- `document` (`passport|national-id|utility-bill|selfie-match|other`)
- `mutual` (web-of-trust edge)

### POST `/verifications/revoke`

Protected by `x-api-key`. Revokes a verification event by `verificationId`.

### GET `/verifications/:userId`

Returns verification events plus computed summary metrics.

### POST `/auth/sso/token`

Protected by `x-api-key`. Issues a signed JWT containing LifePass identity and trust claims for portal SSO.

### POST `/auth/sso/verify`

Validates a previously issued LifePass SSO JWT and returns decoded claims.

### GET `/pass/qr-payload/:userId`

Returns the QR/NFC prototype payload (LifePass ID + trust level + trust score).

### GET `/pass/qr/:userId`

Returns the same payload plus a generated QR code data URL.

### POST `/onboarding/verify`

Protected by `x-api-key`. Updates verification status (`pending`, `approved`, `rejected`).
Approval initializes a baseline trust score.

### GET `/trust/:userId`

Returns trust score record for a user.

Sprint 1 trust policy (`policyVersion: v2`) factors in verification endorsements, document checks, mutual links, rejected docs, and mint state.

### POST `/trust/:userId/update`

Protected by `x-api-key`. Updates trust score with reason.

### POST `/ai/chat`

Returns onboarding guidance and portal recommendation using profile + trust + semantic matches.

### POST `/embeddings/upsert`

Protected by `x-api-key`. Upserts an embedding entry.

### POST `/embeddings/query`

Performs semantic search against stored user-purpose/skills embeddings.

### Portal Routes

- `GET /portals/commons/status`
- `GET /portals/commons/me` (requires SSO bearer token; min Bronze)
- `GET /portals/agri/status`
- `POST /portals/agri/requests` (requires SSO bearer token; min Bronze)
- `GET /portals/agri/requests` (requires SSO bearer token; min Silver)
- `GET /portals/health/status`
- `GET /portals/health/age-gated-services` (requires SSO bearer token; min Silver)
- `GET /portals/policy-matrix` (requires `x-api-key`; returns effective policy matrix)
- `POST /portals/policy-matrix` (requires `x-api-key` + `x-policy-admin-key`; updates policy override matrix)
- `POST /portals/policy-matrix/preview` (requires `x-api-key` + `x-policy-admin-key`; returns diff/impact preview without applying)
- `GET /portals/policy-snapshots?limit=50` (requires `x-api-key` + `x-policy-admin-key`; returns policy snapshots)
- `POST /portals/policy-snapshots/:snapshotId/restore` (requires `x-api-key` + `x-policy-admin-key`; restores snapshot)
- `GET /portals/access-audit?limit=50` (requires `x-api-key`; returns recent allow/deny decisions)
  - Optional filters: `decision`, `covenant`, `policyKey`, `userId`
  - Optional export: `format=csv`
- `GET /portals/access-audit/alerts` (requires `x-api-key` + `x-policy-admin-key`; deny-spike alerts by covenant)
  - Optional query: `threshold`, `windowMinutes`
- `GET /portals/policy-admin/audit?limit=50` (requires `x-api-key` + `x-policy-admin-key`; returns policy update audit events)

For protected portal routes, pass `Authorization: Bearer <token>` where token is created by `/auth/sso/token`.

Policy thresholds are configurable with `LIFEPASS_PORTAL_POLICY_JSON` (JSON map by covenant and policy key).
Access decision logs are retained in file-backed storage and trimmed by `PORTAL_ACCESS_AUDIT_MAX_ROWS`.
Policy admin update routes require `POLICY_ADMIN_KEY`; admin audit retention is controlled by `POLICY_ADMIN_AUDIT_MAX_ROWS`.
Policy snapshots are retained by `POLICY_SNAPSHOT_MAX_ROWS`. Deny alert defaults are configurable via `PORTAL_DENY_ALERT_THRESHOLD` and `PORTAL_DENY_ALERT_WINDOW_MINUTES`.

## Future API Extensions

Additional endpoints may include:

- `GET /sbt/:tokenId` — Retrieve metadata and verification status for a token.
- `POST /proof/revoke` — Revoke an issued proof.
- `POST /sbt/update` — Update token metadata.

GraphQL support can be added to provide a strongly typed schema and subscription capabilities for real‑time updates.