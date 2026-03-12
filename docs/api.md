# API Documentation

The LifePass backend exposes a REST API for interacting with the smart contracts and zero‑knowledge proofs.  This document describes the available endpoints and their expected inputs and outputs.

## Base URL

By default, the API server runs on `http://localhost:3003`.  When deploying to production, configure the `PORT`, `RPC_URL`, `PRIVATE_KEY` and contract addresses via environment variables.

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

### POST `/onboarding/verify`

Protected by `x-api-key`. Updates verification status (`pending`, `approved`, `rejected`).
Approval initializes a baseline trust score.

### GET `/trust/:userId`

Returns trust score record for a user.

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
- `GET /portals/agri/status`
- `POST /portals/agri/requests`
- `GET /portals/agri/requests`
- `GET /portals/health/status`

## Future API Extensions

Additional endpoints may include:

- `GET /sbt/:tokenId` — Retrieve metadata and verification status for a token.
- `POST /proof/revoke` — Revoke an issued proof.
- `POST /sbt/update` — Update token metadata.

GraphQL support can be added to provide a strongly typed schema and subscription capabilities for real‑time updates.