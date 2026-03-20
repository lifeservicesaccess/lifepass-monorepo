from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.nodes.execute_api_action import execute_api_action
from app.nodes.finalize_run import finalize_run
from app.nodes.hydrate_context import hydrate_context
from app.nodes.plan_actions import plan_actions
from app.nodes.request_human_approval import request_human_approval
from app.nodes.route_intent import route_intent
from app.tools.lifepass_api import LifePassApiClient


class AgentState(TypedDict):
    run_id: str
    user_id: str
    request_id: str
    channel: str
    input_text: str
    intent: str
    recommended_portal: str | None
    trust_level: str | None
    trust_score: int | None
    sso_token: str | None
    plan: list[dict[str, Any]]
    requires_human_approval: bool
    approval_status: str | None
    action_results: list[dict[str, Any]]
    next_steps: list[str]
    errors: list[str]
    metadata: dict[str, Any]
    status: str


def _needs_approval(state: AgentState) -> str:
    return 'approval' if state['requires_human_approval'] else 'execute'


def build_lifepass_intake_graph(api_client: LifePassApiClient):
    workflow = StateGraph(AgentState)

    async def hydrate_context_node(state: AgentState):
        return await hydrate_context(state, api_client)

    async def execute_api_action_node(state: AgentState):
        return await execute_api_action(state, api_client)

    workflow.add_node('hydrate_context', hydrate_context_node)
    workflow.add_node('route_intent', route_intent)
    workflow.add_node('plan_actions', plan_actions)
    workflow.add_node('request_human_approval', request_human_approval)
    workflow.add_node('execute_api_action', execute_api_action_node)
    workflow.add_node('finalize_run', finalize_run)

    workflow.set_entry_point('hydrate_context')
    workflow.add_edge('hydrate_context', 'route_intent')
    workflow.add_edge('route_intent', 'plan_actions')
    workflow.add_conditional_edges(
        'plan_actions',
        _needs_approval,
        {
            'approval': 'request_human_approval',
            'execute': 'execute_api_action'
        }
    )
    workflow.add_edge('request_human_approval', 'finalize_run')
    workflow.add_edge('execute_api_action', 'finalize_run')
    workflow.add_edge('finalize_run', END)
    return workflow.compile()
