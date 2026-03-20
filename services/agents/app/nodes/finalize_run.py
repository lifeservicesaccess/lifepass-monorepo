from __future__ import annotations

from typing import Any


def finalize_run(state: dict[str, Any]) -> dict[str, Any]:
    if state['status'] != 'waiting_approval' and not state['errors']:
        state['status'] = 'completed'

    if state['errors'] and state['status'] != 'waiting_approval':
        state['status'] = 'failed'

    if state['status'] == 'completed' and not state['next_steps']:
        state['next_steps'] = ['Review the completed action results.']

    return state
