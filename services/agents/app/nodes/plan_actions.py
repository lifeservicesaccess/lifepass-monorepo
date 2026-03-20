from __future__ import annotations

from typing import Any


def plan_actions(state: dict[str, Any]) -> dict[str, Any]:
    intent = state['intent']
    state['plan'] = []
    state['requires_human_approval'] = False
    state['next_steps'] = []

    if intent == 'portal_recommendation':
        state['plan'].append({'tool': 'recommend_portal', 'path': '/ai/chat'})
        state['next_steps'].append('Return recommended portal and onboarding guidance.')
    elif intent == 'agri_request':
        state['recommended_portal'] = 'agri'
        state['plan'].append({'tool': 'issue_sso_token', 'path': '/auth/sso/token'})
        state['plan'].append({'tool': 'submit_agri_request', 'path': '/portals/agri/requests'})
        state['requires_human_approval'] = True
        state['next_steps'].append('Await steward approval before submitting agri request.')
    elif intent == 'health_access':
        state['recommended_portal'] = 'health'
        state['plan'].append({'tool': 'issue_sso_token', 'path': '/auth/sso/token'})
        state['plan'].append({'tool': 'get_health_services', 'path': '/portals/health/age-gated-services'})
        state['next_steps'].append('Check health portal eligibility with current trust level.')
    elif intent == 'mint':
        state['recommended_portal'] = 'lifepass'
        state['plan'].append({'tool': 'mint_sbt', 'path': '/sbt/mint'})
        state['requires_human_approval'] = True
        state['next_steps'].append('Minting requires explicit human approval before execution.')
    elif intent == 'policy_admin':
        state['recommended_portal'] = 'governance'
        state['plan'].append({'tool': 'preview_policy_change', 'path': '/portals/policy-matrix/preview'})
        state['requires_human_approval'] = True
        state['next_steps'].append('Preview policy impact, then wait for steward approval.')
    elif intent == 'onboarding':
        state['recommended_portal'] = 'commons'
        state['plan'].append({'tool': 'recommend_portal', 'path': '/ai/chat'})
        state['next_steps'].append('Guide the user through onboarding and portal selection.')
    else:
        state['next_steps'].append('Ask a clarifying question or route to a human steward.')

    return state
