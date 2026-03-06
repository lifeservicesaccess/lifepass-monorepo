# Funding the Deployer Wallet on Polygon Amoy Testnet

The LifePassSBT deployment script is configured to use the following deployer address:

```
0x8644010A2B94441c1e4e524e8a3b20395d1A84b6
```

Before you can run `forge script ... --broadcast`, this wallet must hold enough
Amoy testnet MATIC (POL) to pay for gas.  A typical UUPS proxy deployment
consumes roughly **1-2 million gas units**; at the default Amoy base-fee of
~30 Gwei that amounts to **~0.03-0.06 MATIC**.  Request at least **0.5 MATIC**
to have a comfortable buffer.

---

## Working Amoy Faucets

| Faucet | URL | Notes |
|--------|-----|-------|
| Polygon Official | <https://faucet.polygon.technology/> | Select **Amoy**, paste address, solve captcha |
| Alchemy | <https://www.alchemy.com/faucets/polygon-amoy> | Free Alchemy account required |
| QuickNode | <https://faucet.quicknode.com/polygon/amoy> | Free QuickNode account required |
| Chainlink | <https://faucets.chain.link/polygon-amoy> | Wallet connect required |
| Triangle Platform | <https://faucet.triangleplatform.com/polygon/amoy> | No account needed |

> **Tip:** If one faucet is rate-limited or down, try the next one in the table.
> Multiple faucet requests from different providers are allowed.

---

## Verifying the Balance

```bash
# Using cast (comes with Foundry):
cast balance 0x8644010A2B94441c1e4e524e8a3b20395d1A84b6 \
  --rpc-url https://rpc-amoy.polygon.technology

# Or check on Amoy PolygonScan:
# https://amoy.polygonscan.com/address/0x8644010A2B94441c1e4e524e8a3b20395d1A84b6
```

---

## Deploying After Funding

```bash
# 1. Copy and fill in environment variables.
cp contracts/.env.example contracts/.env
# Edit contracts/.env – set DEPLOYER_PRIVATE_KEY and AMOY_RPC_URL.

# 2. Install Foundry dependencies.
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install OpenZeppelin/openzeppelin-contracts-upgradeable --no-commit

# 3. Build.
forge build

# 4. Deploy to Amoy.
forge script script/Deploy.s.sol \
  --rpc-url amoy \
  --broadcast \
  --verify \
  -vvvv
```
