# AI Guide and Embedding Layer

## AI Chat Endpoint

- `POST /ai/chat`
  - Inputs: `userId`, `message`
  - Uses profile + trust score + vector search hits
  - Returns onboarding recommendation and suggested portal

Current implementation is a deterministic/stubbed guide in `services/api/tools/chatGuide.js`.
It is designed to be replaced with a model-backed client using `OPENAI_API_KEY` or an equivalent provider.

## Embedding API

- `POST /embeddings/upsert` (API key protected)
- `POST /embeddings/query`

Vector storage is currently file-backed (`services/data/embeddings.json`) with a deterministic local embedding function.

## Python Agent

`agents/chat_guide.py` provides a Python-side guide agent interface for orchestration and future LangChain integration.
