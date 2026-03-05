"""
Orchestration graph for LifePass multi‑agent system.

This module defines the agent roster, the tool schemas, and high‑level orchestration logic.  It can be used by the AI Agent Engineer GPT to bootstrap LangChain/AutoGen flows.
"""

from typing import Dict, List

# Agent definitions.  Each agent has a name and a list of tools it can invoke.
AGENTS: List[Dict[str, List[str]]] = [
    {"name": "PurposeGuide", "tools": ["ProfileDB", "ZKProof", "Wallet"]},
    {"name": "Verifier", "tools": ["DocCheck", "FaceMatch", "AttestationRegistry"]},
]

# Policies governing interactions and privacy.
POLICIES: Dict[str, object] = {
    "pii_handling": "zk-first",  # Never reveal raw PII; use zero‑knowledge proofs when available.
    "handoff_timeout_s": 60        # Max time to wait for an agent hand‑off.
}

# Events that trigger orchestration flows.
EVENTS: List[str] = ["OnMint", "OnUpgrade", "OnRevocation"]


def get_orchestration_graph() -> Dict[str, object]:
    """Return a dictionary representing the orchestration graph."""
    return {
        "agents": AGENTS,
        "policies": POLICIES,
        "events": EVENTS,
    }
