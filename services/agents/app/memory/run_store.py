from __future__ import annotations

from datetime import datetime, timezone
from typing import Protocol

from app.models.run import RunRecord


class RunStore(Protocol):
    async def save(self, run: RunRecord) -> RunRecord: ...
    async def get(self, run_id: str) -> RunRecord | None: ...
    async def save_checkpoint(self, run_id: str, step_name: str, state: dict) -> None: ...


class InMemoryRunStore:
    def __init__(self) -> None:
        self._runs: dict[str, RunRecord] = {}
        self._checkpoints: list[dict] = []

    async def save(self, run: RunRecord) -> RunRecord:
        run.updated_at = datetime.now(timezone.utc).isoformat()
        self._runs[run.run_id] = run
        return run

    async def get(self, run_id: str) -> RunRecord | None:
        return self._runs.get(run_id)

    async def save_checkpoint(self, run_id: str, step_name: str, state: dict) -> None:
        self._checkpoints.append({
            'run_id': run_id,
            'step_name': step_name,
            'state': state,
            'created_at': datetime.now(timezone.utc).isoformat()
        })


class PostgresRunStore:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._pool = None

    async def _get_pool(self):
        if self._pool is None:
            import asyncpg

            self._pool = await asyncpg.create_pool(dsn=self._dsn, min_size=1, max_size=4)
        return self._pool

    async def save(self, run: RunRecord) -> RunRecord:
        run.updated_at = datetime.now(timezone.utc).isoformat()
        pool = await self._get_pool()
        payload = run.model_dump(by_alias=True)
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO agent_runs (
                  run_id, user_id, request_id, status, intent, requires_human_approval,
                  approval_status, recommended_portal, trust_level, trust_score, payload,
                  created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6,
                  $7, $8, $9, $10, $11::jsonb,
                  $12::timestamptz, $13::timestamptz
                )
                ON CONFLICT (run_id) DO UPDATE SET
                  status = EXCLUDED.status,
                  intent = EXCLUDED.intent,
                  requires_human_approval = EXCLUDED.requires_human_approval,
                  approval_status = EXCLUDED.approval_status,
                  recommended_portal = EXCLUDED.recommended_portal,
                  trust_level = EXCLUDED.trust_level,
                  trust_score = EXCLUDED.trust_score,
                  payload = EXCLUDED.payload,
                  updated_at = EXCLUDED.updated_at
                """,
                run.run_id,
                run.user_id,
                run.request_id,
                run.status,
                run.intent,
                run.requires_human_approval,
                run.approval_status,
                run.recommended_portal,
                run.trust_level,
                run.trust_score,
                __import__('json').dumps(payload),
                run.created_at,
                run.updated_at,
            )
        return run

    async def get(self, run_id: str) -> RunRecord | None:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow('SELECT payload FROM agent_runs WHERE run_id = $1', run_id)
        if not row:
            return None
        return RunRecord.model_validate(dict(row['payload']))

    async def save_checkpoint(self, run_id: str, step_name: str, state: dict) -> None:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                'INSERT INTO agent_checkpoints (run_id, step_name, state) VALUES ($1, $2, $3::jsonb)',
                run_id,
                step_name,
                __import__('json').dumps(state),
            )


run_store = InMemoryRunStore()
