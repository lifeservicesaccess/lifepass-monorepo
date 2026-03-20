from __future__ import annotations

from typing import Any


def request_human_approval(state: dict[str, Any]) -> dict[str, Any]:
    state['approval_status'] = 'pending'
    state['status'] = 'waiting_approval'
    return state
