from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings


class LifePassApiClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.base_url = settings.api_base_url.rstrip('/')

    def _headers(self) -> dict[str, str]:
        headers = {'Content-Type': 'application/json'}
        if self.settings.api_key:
            headers['x-api-key'] = self.settings.api_key
        return headers

    def _policy_headers(self) -> dict[str, str]:
        headers = self._headers()
        if self.settings.policy_admin_key:
            headers['x-policy-admin-key'] = self.settings.policy_admin_key
        if self.settings.policy_admin_key_id:
            headers['x-policy-admin-key-id'] = self.settings.policy_admin_key_id
        headers['x-admin-actor'] = self.settings.admin_actor
        return headers

    async def _get(self, path: str, headers: dict[str, str] | None = None, params: dict[str, Any] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.settings.timeout_seconds) as client:
            response = await client.get(f'{self.base_url}{path}', headers=headers or self._headers(), params=params)
            response.raise_for_status()
            return response.json()

    async def _post(self, path: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.settings.timeout_seconds) as client:
            response = await client.post(f'{self.base_url}{path}', headers=headers or self._headers(), json=payload)
            response.raise_for_status()
            return response.json()

    async def get_health(self) -> dict[str, Any]:
        return await self._get('/health', headers={'Content-Type': 'application/json'})

    async def get_dashboard(self, user_id: str) -> dict[str, Any]:
        return await self._get(f'/users/{user_id}/dashboard')

    async def get_trust(self, user_id: str) -> dict[str, Any]:
        return await self._get(f'/trust/{user_id}')

    async def recommend_portal(self, user_id: str, input_text: str) -> dict[str, Any]:
        return await self._post('/ai/chat', {'userId': user_id, 'message': input_text})

    async def issue_sso_token(self, user_id: str) -> dict[str, Any]:
        return await self._post('/auth/sso/token', {'userId': user_id})

    async def submit_agri_request(self, sso_token: str, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {'Authorization': f'Bearer {sso_token}', 'Content-Type': 'application/json'}
        return await self._post('/portals/agri/requests', payload, headers=headers)

    async def get_health_services(self, sso_token: str) -> dict[str, Any]:
        headers = {'Authorization': f'Bearer {sso_token}', 'Content-Type': 'application/json'}
        return await self._get('/portals/health/age-gated-services', headers=headers)

    async def mint_sbt(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post('/sbt/mint', payload)

    async def preview_policy_change(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._post('/portals/policy-matrix/preview', payload, headers=self._policy_headers())
