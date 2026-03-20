from __future__ import annotations

from typing import Any

from app.tools.lifepass_api import LifePassApiClient


async def execute_api_action(state: dict[str, Any], api_client: LifePassApiClient) -> dict[str, Any]:
    for step in state['plan']:
        tool = step['tool']
        if tool == 'recommend_portal':
            result = await api_client.recommend_portal(state['user_id'], state['input_text'])
            state['recommended_portal'] = result.get('recommendedPortal') or state['recommended_portal']
        elif tool == 'issue_sso_token':
            result = await api_client.issue_sso_token(state['user_id'])
            state['sso_token'] = (result.get('session') or {}).get('token') or result.get('token')
        elif tool == 'submit_agri_request':
            result = await api_client.submit_agri_request(
                state['sso_token'],
                {'message': state['input_text'], 'userId': state['user_id']}
            )
        elif tool == 'get_health_services':
            result = await api_client.get_health_services(state['sso_token'])
        elif tool == 'mint_sbt':
            profile = state['metadata'].get('profile') or {}
            result = await api_client.mint_sbt(
                {
                    'userId': state['user_id'],
                    'to': profile.get('walletAddress') or '0x0000000000000000000000000000000000000000',
                    'tokenId': int(state['trust_score'] or 0) + 1,
                    'purpose': profile.get('purposeStatement') or state['input_text']
                }
            )
        elif tool == 'preview_policy_change':
            result = await api_client.preview_policy_change(
                {
                    'reason': 'agent-preview',
                    'replace': False,
                    'matrix': {
                        'health': {
                            'ageGatedServices': {
                                'audience': 'zionstack-portals',
                                'minTrustLevel': 'silver'
                            }
                        }
                    }
                }
            )
        else:
            result = {'success': False, 'error': f'unsupported tool: {tool}'}

        state['action_results'].append({'tool': tool, 'result': result})

    state['status'] = 'completed'
    return state
