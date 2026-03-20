# LifePass Agents Service

`services/agents` is the supervised orchestration layer for LifePass portal workflows.

This service is intentionally narrow in v1:

- it classifies requests,
- hydrates context from `services/api`,
- plans the next action,
- pauses for approval on sensitive actions,
- and only then calls the existing governed API.

It does not bypass policy, trust, SSO, or audit controls that already exist in `services/api`.

## Initial Scope

The first graph is `lifepass_intake_graph`.

Supported intents:

- `portal_recommendation`
- `agri_request`
- `health_access`
- `mint`
- `policy_admin`
- `onboarding`
- `unknown`

Sensitive actions such as minting and policy changes are returned as `waiting_approval` until a human resumes the run through `/agents/continue`.

## Routes

- `GET /health`
- `POST /agents/act`
- `POST /agents/continue`
- `GET /agents/runs/{run_id}`

## Environment

- `AGENTS_API_BASE_URL` base URL for `services/api`.
- `AGENTS_API_KEY` backend API key used to call protected LifePass API routes.
- `AGENTS_TIMEOUT_SECONDS` upstream timeout.
- `AGENTS_DATABASE_URL` Postgres connection string for agent run persistence.
- `AGENTS_N8N_CONTINUE_WEBHOOK_URL` optional steward approval endpoint used in approval metadata.

Optional:

- `AGENTS_POLICY_ADMIN_KEY_ID`
- `AGENTS_POLICY_ADMIN_KEY`
- `AGENTS_ADMIN_ACTOR`

## Local Run

```powershell
cd services/agents
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3011
```

If Python is not on PATH on Windows, install Python 3.11 first or use the full interpreter path.

## Persistence

Agent runtime tables are expected to live in the same Postgres cluster as the governed API tables.

Apply migrations through the existing API migration runner after adding the agents migration:

```powershell
cd services/api
npm run db:migrate
```

The agents service will use `AGENTS_DATABASE_URL` when set. Without it, the service falls back to an in-memory run store for local prototyping only.

## n8n Approval Handshake

For approval-gated actions, `/agents/act` stores an approval envelope under `run.metadata.approval`.

Recommended flow:

1. n8n calls `POST /agents/act`.
2. If status is `waiting_approval`, n8n sends the approval payload to a human steward.
3. On approve or reject, n8n calls `POST /agents/continue` with the same `runId`.

Example continue payload:

```json
{
	"runId": "<run-id>",
	"decision": "approved",
	"actor": "steward@example.com",
	"notes": "Approved by steward review"
}
```

## Design Notes

- The canonical trust, SSO, policy, and audit boundary remains in `services/api`.
- LangGraph manages flow state; it does not replace the API as the policy enforcement layer.
- Postgres-backed run persistence is now scaffolded; Redis can be added later for resumability and event fanout.
- Recoverable context hydration gaps are stored under `metadata.warnings`; only hard execution failures should move a run to `failed`.

