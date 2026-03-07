# LifePass & ZIONSTACK Multi‑GPT Monorepo

This repository contains the skeleton for building the LifePass identity system as described in the blueprint.  It is organised into separate packages for the web app, mobile app, backend services, smart contracts, zero‑knowledge circuits, and agent orchestration code.  Each component is designed to be developed by specialist GPTs under an orchestrator.

## Structure

- **apps/web** — Next.js front‑end for the LifePass portal (placeholder).
- **apps/mobile** — React Native application skeleton (placeholder).
- **services/api** — Node/Express backend exposing REST/GraphQL endpoints.
- **contracts** — Solidity smart contracts, tests, deployment scripts.
- **zk** — Zero‑knowledge circuits and verifiers (e.g., Circom).
- **agents** — Python package defining multi‑agent orchestration (LangChain/AutoGen).
- **infra** — Infrastructure as code (e.g., Terraform), CI/CD configuration.
- **docs** — Documentation (MkDocs or Docusaurus).

The repository is ready for augmentation by specialised GPT agents.

## Environment Quick Start

Use the checklist script to switch between simulated and testnet modes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-readiness.ps1 -Mode simulated -Apply
```

For testnet mode, set required env values first, then run:

```powershell
Copy-Item .\services\api\.env.testnet.example .\services\api\.env.local -Force
Copy-Item .\apps\web\.env.testnet.example .\apps\web\.env.local -Force
```

Then edit both `.env.local` files and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-readiness.ps1 -Mode testnet -Apply
```

Then run end-to-end API smoke checks (auto-starts API and stops it when done):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\testnet-smoke.ps1 -Mode testnet
```

If deployment fails with `INSUFFICIENT_FUNDS`, use the Amoy funding helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\request-faucet.ps1
```

Detailed funding walkthrough: `docs/FUNDING.md`.
