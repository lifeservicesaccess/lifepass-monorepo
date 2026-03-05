# API Documentation

The LifePass backend exposes a REST API for interacting with the smart contracts and zero‑knowledge proofs.  This document describes the available endpoints and their expected inputs and outputs.

## Base URL

By default, the API server runs on `http://localhost:3000`.  When deploying to production, configure the `PORT`, `RPC_URL`, `PRIVATE_KEY` and contract addresses via environment variables.

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

Error responses include `success: false` and an `error` field.

## Future API Extensions

Additional endpoints may include:

- `GET /sbt/:tokenId` — Retrieve metadata and verification status for a token.
- `POST /proof/revoke` — Revoke an issued proof.
- `POST /sbt/update` — Update token metadata.

GraphQL support can be added to provide a strongly typed schema and subscription capabilities for real‑time updates.