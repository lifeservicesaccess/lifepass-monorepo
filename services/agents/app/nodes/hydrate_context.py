from __future__ import annotations

from typing import Any

from app.tools.lifepass_api import LifePassApiClient


def _add_warning(state: dict[str, Any], message: str) -> None:
    warnings = state['metadata'].setdefault('warnings', [])
    warnings.append(message)


async def hydrate_context(state: dict[str, Any], api_client: LifePassApiClient) -> dict[str, Any]:
    user_id = state['user_id']
    dashboard = None
    trust = None

    try:
        dashboard = await api_client.get_dashboard(user_id)
    except Exception as exc:  # noqa: BLE001
        _add_warning(state, f'dashboard lookup failed: {exc}')

    try:
        trust = await api_client.get_trust(user_id)
    except Exception as exc:  # noqa: BLE001
        _add_warning(state, f'trust lookup failed: {exc}')

    profile = (dashboard or {}).get('profile') or {}
    trust_record = (trust or {}).get('trust') or (dashboard or {}).get('trust') or {}
    state['metadata']['dashboard'] = dashboard or {}
    state['metadata']['profile'] = profile
    state['trust_level'] = trust_record.get('level')
    state['trust_score'] = trust_record.get('score')
    return state
