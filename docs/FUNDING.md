# Funding The Amoy Deployer

This project deploys contracts from the deployer account configured in `services/api/.env.local` via `PRIVATE_KEY`.

## Current blocker

`node services/api/scripts/deploy_contract.js` fails with `INSUFFICIENT_FUNDS` when the deployer has less than the required POL for gas.

## Quick status check

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\request-faucet.ps1
```

This prints:
- Deployer address
- Current POL balance on Amoy
- Estimated minimum recommended balance
- Faucet links

## Fund the deployer

1. Open the helper script output links (or run with `-Open`).
2. Request test POL for the deployer address.
3. Wait for funding confirmation on PolygonScan.
4. Re-run deployment:

```powershell
cd services/api
node scripts/deploy_contract.js
```

5. Copy deployed address into `services/api/.env.local`:

```dotenv
SBT_CONTRACT_ADDRESS=0x...
```

6. Validate strict testnet mode:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-readiness.ps1 -Mode testnet
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-smoke.ps1 -Mode testnet
```

## Notes

- Faucet availability/rate limits change frequently.
- Keep a safety margin above the estimate to avoid base-fee spikes.
- Do not commit secrets from `.env.local`.
