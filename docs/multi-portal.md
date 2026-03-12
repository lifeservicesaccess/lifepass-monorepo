# Multi-Portal Architecture

## Portal Modules

Portal handlers are mounted under `services/api/portals` and served through `app.use('/portals', createPortalRouter())`.

Current portal stubs:

- `GET /portals/commons/status`
- `GET /portals/agri/status`
- `POST /portals/agri/requests`
- `GET /portals/agri/requests`
- `GET /portals/health/status`

## Portal Recommendation Path

- User profile purpose + skills are embedded through `/embeddings/upsert`.
- AI guide route `/ai/chat` uses trust score + semantic matches from `/embeddings/query`.
- Response includes `recommendedPortal` (`commons`, `agri`, `health`).

## Expansion Plan

1. Add per-portal policy validators (eligibility, SLA, fee profile).
2. Add per-portal contracts where required.
3. Add cross-portal ZK bridge payload schema for selective disclosure.
