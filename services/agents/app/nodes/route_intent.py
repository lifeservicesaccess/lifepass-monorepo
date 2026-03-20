from __future__ import annotations

from typing import Any


def route_intent(state: dict[str, Any]) -> dict[str, Any]:
    text = state['input_text'].lower()

    if 'mint' in text or 'sbt' in text:
        state['intent'] = 'mint'
    elif 'policy' in text or 'governance' in text or 'approval' in text:
        state['intent'] = 'policy_admin'
    elif 'agri' in text or 'farm' in text or 'request' in text:
        state['intent'] = 'agri_request'
    elif 'health' in text or 'clinic' in text or 'age-gated' in text:
        state['intent'] = 'health_access'
    elif 'signup' in text or 'onboarding' in text or 'register' in text:
        state['intent'] = 'onboarding'
    elif 'portal' in text or 'recommend' in text or 'where should i go' in text:
        state['intent'] = 'portal_recommendation'
    else:
        state['intent'] = 'unknown'

    return state
