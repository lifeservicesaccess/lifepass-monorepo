# LifePass Documentation

This directory contains markdown files and configuration for generating developer and user documentation.

## Setup

You can use MkDocs or Docusaurus. For MkDocs:

```bash
pip install mkdocs-material
mkdocs serve
```

## Contents

- `whitepaper.md` — A high‑level overview of the LifePass & ZIONSTACK architecture, including the hub‑and‑spokes multi‑GPT design, key components (contracts, zk circuits, API, UI, agents), and governance principles.
- `api.md` — REST/GraphQL specifications for the backend service, including sample requests and response schemas.
- `contracts.md` — Documentation for the LifePassSBT smart contract, deployment guide, and upgrade strategy.
- `zk.md` — Explanation of the over‑18 Circom circuit and instructions for generating and verifying proofs using snarkjs.
- `frontend.md` — Guide to running the Next.js web app and integrating wallet providers.
- `agent.md` — Description of the PurposeGuide agent and orchestration policies.
- `qa.md` — Test plan covering smart contracts, API endpoints and end‑to‑end user flows.

Each of these files is currently a placeholder and should be expanded by the appropriate specialist GPTs or human collaborators as development progresses.
