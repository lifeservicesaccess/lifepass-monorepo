# LifePass API Endpoints

## Profile DB
- Migration: `node scripts/migrate_profiles.js` (creates `profiles` table in Postgres)
- Seed: `node scripts/seed_profiles.js` (adds demo users)

## Contract Deployment
- SBT: `node scripts/deploy_contract.js` (deploys LifePassSBT)
- AgeVerifier: `node scripts/deploy_age_verifier.js` (deploys AgeVerifier)

## API Endpoints
- `POST /flow/mint` — Full flow: fetch profile, ZK proof, on-chain verify, mint SBT
- `POST /proof/verify-onchain` — Verify proof using on-chain contract (or fallback)
- `POST /sbt/mint` — Direct mint (requires contract configured)

### Auth
- Set `API_KEY` env var and use `x-api-key` header for protected endpoints

### Environment
- `PG_CONNECTION_STRING` or `DATABASE_URL` for Postgres
- `RPC_URL`, `PRIVATE_KEY`, `SBT_CONTRACT_ADDRESS`, `AGE_VERIFIER_ADDRESS` for contract ops
