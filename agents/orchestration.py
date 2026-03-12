"""
Orchestration graph for LifePass multi‑agent system.

This module defines the agent roster, the tool schemas, and high‑level orchestration logic.  It can be used by the AI Agent Engineer GPT to bootstrap LangChain/AutoGen flows.
"""

from typing import Dict, List

# Agent definitions.  Each agent has a name and a list of tools it can invoke.
AGENTS: List[Dict[str, List[str]]] = [
    {"name": "MetaOrchestrator", "tools": ["TaskRouter", "PolicyGuard"]},
    {"name": "PurposeGuide", "tools": ["ProfileDB", "ZKProof", "Wallet"]},
    {"name": "ChatGuide", "tools": ["ProfileDB", "TrustScore", "VectorSearch"]},
    {"name": "AgriGPT", "tools": ["PortalAgri", "ServiceRequests", "VectorSearch"]},
    {"name": "HealthGPT", "tools": ["PortalHealth", "Eligibility", "VectorSearch"]},
    {"name": "Verifier", "tools": ["DocCheck", "FaceMatch", "AttestationRegistry"]},
]

# Policies governing interactions and privacy.
POLICIES: Dict[str, object] = {
    "pii_handling": "zk-first",  # Never reveal raw PII; use zero‑knowledge proofs when available.
    "handoff_timeout_s": 60        # Max time to wait for an agent hand‑off.
}

# Events that trigger orchestration flows.
EVENTS: List[str] = [
    "OnSignup",
    "OnVerificationApproved",
    "OnMint",
    "OnUpgrade",
    "OnRevocation",
    "OnPortalRequest",
]

HANDOFF_SCHEMA: Dict[str, Dict[str, object]] = {
    "ProtocolDesigner->CodeGen": {
        "required_fields": ["task_id", "scope", "acceptance_criteria"],
        "output": "implementation_plan"
    },
    "CodeGen->TestAudit": {
        "required_fields": ["task_id", "files_changed", "risk_notes"],
        "output": "test_report"
    },
    "TestAudit->UXUI": {
        "required_fields": ["task_id", "known_limits", "api_contract"],
        "output": "ux_changes"
    }
}


def get_orchestration_graph() -> Dict[str, object]:
    """Return a dictionary representing the orchestration graph."""
    return {
        "agents": AGENTS,
        "policies": POLICIES,
        "events": EVENTS,
        "handoff_schema": HANDOFF_SCHEMA,
    }
