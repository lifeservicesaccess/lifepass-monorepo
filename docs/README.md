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
- `onboarding.md` — User signup, verification workflow and trust-score lifecycle.
- `multi-portal.md` — Backend portal module design and routing strategy.
- `ai-guide.md` — AI chat guide and vector embedding/search integration notes.
- `render-mcp.md` — Connect Render's hosted MCP server to Cursor and Claude Code for deploy, log, metrics, and build-failure diagnosis.
- `render-log-playbook.md` — Short mapping of common Render log signatures and request failures to likely fixes for LifePass.
- `render-oncall-checklist.md` — One-page incident checklist with exact Render dashboard actions for LifePass outages and deploy failures.
- `lifepass-portal-blueprint.md` — Product blueprint for the LifePass portal, including core layers, user journey, launch strategy, MVP stack, and monorepo milestone mapping.

Each of these files is currently a placeholder and should be expanded by the appropriate specialist GPTs or human collaborators as development progresses.
