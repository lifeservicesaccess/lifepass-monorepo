#!/usr/bin/env bash
# request-faucet.sh
# Attempts to fund DEPLOYER_ADDRESS on Polygon Amoy testnet from several public
# faucet APIs.  Run this script once to seed the deployer wallet with enough
# MATIC to cover contract deployment gas.
#
# Usage:
#   bash scripts/request-faucet.sh
#
# The script tries each faucet in order and stops after the first successful
# response.  If all faucets fail (rate-limit, maintenance, etc.) follow the
# manual instructions in docs/FUNDING.md.

set -euo pipefail

ADDRESS="0x8644010A2B94441c1e4e524e8a3b20395d1A84b6"
CHAIN_ID=80002  # Polygon Amoy

echo "Requesting Amoy testnet MATIC for deployer: ${ADDRESS}"
echo "Chain ID: ${CHAIN_ID}"
echo ""

# ── Helper ────────────────────────────────────────────────────────────────────
request() {
  local name="$1"; local url="$2"; local data="$3"
  echo -n "Trying ${name} ... "
  local status
  status=$(curl -s -o /tmp/faucet_resp.json -w "%{http_code}" \
    -X POST "${url}" \
    -H "Content-Type: application/json" \
    -d "${data}" \
    --max-time 20 2>/dev/null || echo "000")
  if [[ "${status}" == "2"* ]]; then
    echo "OK (HTTP ${status})"
    cat /tmp/faucet_resp.json | python3 -m json.tool 2>/dev/null || cat /tmp/faucet_resp.json
    echo ""
    return 0
  else
    echo "FAILED (HTTP ${status})"
    return 1
  fi
}

# ── Faucet 1: Polygon official faucet API ─────────────────────────────────────
if request "Polygon official" \
  "https://faucet.polygon.technology/api/v1/faucet" \
  "{\"address\":\"${ADDRESS}\",\"network\":\"amoy\",\"token\":\"matic\"}"; then
  echo "✓ Funding request submitted via Polygon official faucet."
  exit 0
fi

# ── Faucet 2: Triangle Platform ───────────────────────────────────────────────
if request "Triangle Platform" \
  "https://faucet.triangleplatform.com/api/request" \
  "{\"address\":\"${ADDRESS}\",\"chain\":\"polygon-amoy\"}"; then
  echo "✓ Funding request submitted via Triangle Platform faucet."
  exit 0
fi

# ── Faucet 3: Chainlink Amoy faucet ───────────────────────────────────────────
if request "Chainlink" \
  "https://faucets.chain.link/api/faucet" \
  "{\"address\":\"${ADDRESS}\",\"chainId\":${CHAIN_ID}}"; then
  echo "✓ Funding request submitted via Chainlink faucet."
  exit 0
fi

# ── All faucets failed ────────────────────────────────────────────────────────
echo ""
echo "All automated faucet requests failed.  Please fund the address manually:"
echo "  Address : ${ADDRESS}"
echo "  Network : Polygon Amoy (chain ID ${CHAIN_ID})"
echo ""
echo "Manual faucet options:"
echo "  • https://faucet.polygon.technology/"
echo "  • https://www.alchemy.com/faucets/polygon-amoy"
echo "  • https://faucet.quicknode.com/polygon/amoy"
echo "  • https://faucets.chain.link/polygon-amoy"
echo "  • https://faucet.triangleplatform.com/polygon/amoy"
echo ""
echo "See docs/FUNDING.md for full instructions."
exit 1
