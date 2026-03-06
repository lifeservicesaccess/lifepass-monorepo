# LifePass API Endpoints

## Profile DB
- Migration: `node scripts/migrate_profiles.js` (creates `profiles` table in Postgres)
- Seed: `node scripts/seed_profiles.js` (adds demo users)

## Contract Deployment
- SBT: `node scripts/deploy_contract.js` (deploys LifePassSBT)

## API Endpoints
- `POST /flow/mint` — Full flow: fetch profile, ZK proof, on-chain verify, mint SBT
- `POST /proof/verify-onchain` — Verify proof using on-chain contract (or fallback)
- `POST /sbt/mint` — Direct mint (requires contract configured)

### Auth
- Set `API_KEY` env var and use `x-api-key` header for protected endpoints

### Environment
- `PG_CONNECTION_STRING` or `DATABASE_URL` for Postgres
- `RPC_URL`, `PRIVATE_KEY`, `SBT_CONTRACT_ADDRESS`, `AGE_VERIFIER_ADDRESS` for contract ops

## Mode Switching & Readiness Checklist

Use the repository script to validate or apply environment mode in one command:

Testnet env quick-start:

```powershell
# 1) Seed testnet env files from templates
Copy-Item .\services\api\.env.testnet.example .\services\api\.env.local -Force
Copy-Item .\apps\web\.env.testnet.example .\apps\web\.env.local -Force

# 2) Edit both .env.local files with real values
```

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
