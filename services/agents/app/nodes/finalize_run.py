from __future__ import annotations

from typing import Any


def _has_failed_action(state: dict[str, Any]) -> bool:
    for action in state['action_results']:
        result = action.get('result') or {}
        if isinstance(result, dict) and result.get('success') is False:
            return True
    return False


def finalize_run(state: dict[str, Any]) -> dict[str, Any]:
    if state['status'] in {'waiting_approval', 'rejected'}:
        return state

    if state['errors'] or _has_failed_action(state):
        state['status'] = 'failed'
    else:
        state['status'] = 'completed'

    if state['status'] == 'completed' and not state['next_steps']:
        state['next_steps'] = ['Review the completed action results.']

    return state
