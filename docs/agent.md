# Agent Orchestration

The LifePass system employs a multi‑agent architecture where specialised AI agents collaborate to complete tasks under the supervision of an orchestrator.  This document describes the roles and responsibilities of each agent and how they interact.

## Agents

| Agent         | Responsibilities                                               |
|---------------|---------------------------------------------------------------|
| Orchestrator  | Maintains the backlog, assigns tasks to specialist agents, collects artifacts and enforces acceptance criteria. |
| PurposeGuide  | Guides the user through the minting process by coordinating profile retrieval, proof generation and wallet operations. |
| Verifier      | Handles document checks, face matching and registry attestations (stubbed in the current demo). |
| Security      | Performs threat modelling, manages key policies and reviews secrets and permission configurations. |
| QA/Evaluator  | Generates and runs test plans to ensure that contracts, circuits, APIs and UIs meet defined acceptance criteria. |
| Tech Writer   | Produces documentation, whitepapers, API specs and runbooks.  | 

## Orchestration Graph

The orchestration graph is defined in `agents/orchestration.py`.  It specifies which agents are available, their toolkits and the policies governing their interactions.  Events such as `OnMint` or `OnRevocation` trigger flows where the orchestrator delegates tasks to the appropriate agents.

## PurposeGuide Agent

Implemented in `agents/purpose_guide_agent.py`, the `PurposeGuide` agent demonstrates how a high‑level agent may coordinate lower‑level tools:

1. **Profile Retrieval:** Pulls user data from a profile database (mocked in the current demo).
2. **Proof Generation:** Requests a zero‑knowledge proof of age from the ZK proof tool.
3. **Minting:** Invokes the wallet tool to call the smart contract and mint the LifePass SBT.

Future work includes implementing the `profile_db`, `zk_proof_tool` and `wallet_tool` interfaces and integrating the agent with the frontend and backend services.