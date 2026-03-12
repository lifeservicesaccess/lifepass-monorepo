# Agent Orchestration

The LifePass system employs a multi‑agent architecture where specialised AI agents collaborate to complete tasks under the supervision of an orchestrator.  This document describes the roles and responsibilities of each agent and how they interact.

## Agents

| Agent         | Responsibilities                                               |
|---------------|---------------------------------------------------------------|
| Orchestrator  | Maintains the backlog, assigns tasks to specialist agents, collects artifacts and enforces acceptance criteria. |
| PurposeGuide  | Guides the user through the minting process by coordinating profile retrieval, proof generation and wallet operations. |
This document explains how the AI agent layer is expected to orchestrate workflows in the LifePass ecosystem.
| Security      | Performs threat modelling, manages key policies and reviews secrets and permission configurations. |
| QA/Evaluator  | Generates and runs test plans to ensure that contracts, circuits, APIs and UIs meet defined acceptance criteria. |
The repository currently includes:

- `agents/purpose_guide_agent.py`
- `agents/purpose_guide_agent.js`
- `agents/chat_guide.py`
The orchestration graph is defined in `agents/orchestration.py`.  It specifies which agents are available, their toolkits and the policies governing their interactions.  Events such as `OnMint` or `OnRevocation` trigger flows where the orchestrator delegates tasks to the appropriate agents.

## PurposeGuide Agent
`ChatGuide` provides onboarding recommendations using user purpose, skills, and trust score context.

In future iterations, these agents should:
Implemented in `agents/purpose_guide_agent.py`, the `PurposeGuide` agent demonstrates how a high‑level agent may coordinate lower‑level tools:

The `agents/orchestration.py` module now defines:
2. **Proof Generation:** Requests a zero‑knowledge proof of age from the ZK proof tool.
- expanded agent roster (MetaOrchestrator, ChatGuide, AgriGPT, HealthGPT),
- policy values,
- trigger events for orchestration,
- hand-off schema stubs between designer/codegen/test/ux roles.