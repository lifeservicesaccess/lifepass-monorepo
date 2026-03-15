# Render MCP Guide

This guide shows how to connect Render's hosted MCP server to AI tools such as Cursor and Claude Code so you can inspect deploys, logs, metrics, services, and databases with natural-language prompts.

Render hosts its MCP server at `https://mcp.render.com/mcp`.

## Why This Matters For LifePass

This monorepo already deploys the API through Render via `render.yaml`, with the main hosted service named `lifepass-api` and the managed Postgres database named `lifepass-db`.

That makes Render MCP useful for questions like:

- Which deploy of `lifepass-api` failed most recently?
- What error-level logs appeared during startup?
- Did the live service pick up the latest environment variables?
- Is the latest issue a build failure, a startup failure, or an application runtime failure?

## Prerequisites

1. Create a Render API key from the Render dashboard account settings.
2. Treat that key as highly privileged. Render documents that API keys are broadly scoped across accessible workspaces.
3. Set an environment variable on your machine:

```powershell
$env:RENDER_API_KEY = "<your-render-api-key>"
```

For persistent Windows setup, add `RENDER_API_KEY` through the OS environment variable settings or your shell profile.

## Cursor Setup

Cursor supports project config in `.cursor/mcp.json` and global config in `~/.cursor/mcp.json`.

This repo includes an example config at `.cursor/mcp.json.example`.

Recommended remote-server configuration:

```json
{
  "mcpServers": {
    "render": {
      "url": "https://mcp.render.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:RENDER_API_KEY}"
      }
    }
  }
}
```

After adding the server, open Cursor in this repo and ask:

```text
Set my Render workspace to <your-workspace-name>
```

Then verify the connection:

```text
List my Render services
```

## Claude Code Setup

Claude Code supports remote HTTP MCP servers either from the CLI or from project-scoped `.mcp.json` config.

This repo includes an example project-scoped config at `.mcp.json.example`.

### CLI setup

```powershell
claude mcp add --transport http render https://mcp.render.com/mcp --header "Authorization: Bearer $env:RENDER_API_KEY"
```

Useful verification commands:

```powershell
claude mcp list
claude mcp get render
```

Inside Claude Code, verify with:

```text
Set my Render workspace to <your-workspace-name>
List my Render services
```

### Project-scoped JSON setup

Claude Code project-scoped config uses `.mcp.json` in the repo root. This repo includes `.mcp.json.example` with environment-variable expansion:

```json
{
  "mcpServers": {
    "render": {
      "type": "http",
      "url": "https://mcp.render.com/mcp",
      "headers": {
        "Authorization": "Bearer ${RENDER_API_KEY}"
      }
    }
  }
}
```

## Natural-Language Prompts For Build And Deploy Debugging

Start broad, then narrow to a service and deploy.

### Workspace and inventory

- `Set my Render workspace to <your-workspace-name>`
- `List my Render services and identify the LifePass API service`
- `Show me the latest deploys for lifepass-api`

### Build-log diagnosis

- `Show the latest failed deploy for lifepass-api and summarize the first fatal build error`
- `Pull build logs for the most recent failed deploy of lifepass-api and explain the root cause in plain English`
- `Tell me whether the latest lifepass-api failure happened during build, boot, health checks, or runtime`

### Runtime diagnosis

- `Pull recent error-level logs for lifepass-api and group them by repeated failure pattern`
- `Check whether lifepass-api is failing health checks and explain the likely cause`
- `Compare the latest successful deploy and the latest failed deploy for lifepass-api and identify the behavior change`

### Environment and config drift

- `Inspect lifepass-api environment variables and tell me which required values appear missing for this Node API`
- `Based on the current Render service settings, what would cause STARTUP_STRICT to fail for lifepass-api?`
- `Tell me whether lifepass-api looks under-configured for blockchain minting, SSO, or OpenAI-backed chat`

### Metrics and stability

- `Show CPU, memory, and response trends for lifepass-api for the last 24 hours`
- `Was there an error spike or restart pattern around the latest deploy?`

## Repo-Specific Prompts For This Monorepo

These prompts are tuned to the current LifePass stack and recent failure patterns.

- `Check logs for lifepass-api and tell me if startup failed because API_KEY, CORS_ALLOWED_ORIGINS, RPC_URL, PRIVATE_KEY, SBT_CONTRACT_ADDRESS, TRUST_REGISTRY_ADDRESS, or AGE_VERIFIER_ADDRESS is missing or invalid`
- `Analyze the latest lifepass-api deploy logs and tell me whether the app is still running older code than the current repository expectations`
- `Check whether lifepass-api health output suggests STARTUP_STRICT is failing on blockchain or auth configuration`
- `Look at recent logs and tell me whether /sbt/mint failures are caused by bad env vars, insufficient RPC connectivity, stale deploys, or application exceptions`
- `Inspect the lifepass-db instance and summarize any obvious connection or availability issues affecting lifepass-api`

## What Render MCP Can And Cannot Do

Useful capabilities:

- list workspaces, services, databases, deploys, and logs
- inspect metrics
- run read-only SQL queries against Render Postgres
- update service environment variables

Important limitations documented by Render:

- it does not support all Render resource types or all config options
- it is not the right tool for arbitrary service mutations or deploy triggering
- secrets may still be exposed in context, so do not use it casually with sensitive prompts

## Recommended Debugging Flow

1. Set the workspace.
2. Ask for the latest deploy status of `lifepass-api`.
3. Pull the failed deploy logs.
4. Ask the AI to classify the failure as build-time, startup-time, health-check, or runtime.
5. Ask for the smallest concrete fix, not a generic explanation.
6. Re-check logs after redeploy.

Example sequence:

```text
Set my Render workspace to Life Services
Show the latest deploys for lifepass-api
Pull the logs for the most recent failed deploy
Classify the failure and name the single most likely root cause
Tell me the exact env vars or service settings I should fix first
```

## Known LifePass Failure Patterns To Ask About

- startup blocked by `STARTUP_STRICT=1`
- missing blockchain env such as `RPC_URL`, `PRIVATE_KEY`, `SBT_CONTRACT_ADDRESS`, `TRUST_REGISTRY_ADDRESS`, or `AGE_VERIFIER_ADDRESS`
- CORS misconfiguration for the deployed web origin
- stale Render deployment serving older API behavior than the repo
- database migrations not yet applied after provisioning `lifepass-db`
- web deployment missing `API_KEY` or `API_BASE_URL` for the Next.js `/api/mint` proxy

## Related Files

- `render.yaml`
- `docs/render-oncall-checklist.md`
- `docs/render-log-playbook.md`
- `services/api/README.md`
- `docs/frontend.md`
- `README.md`
