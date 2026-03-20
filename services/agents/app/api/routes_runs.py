from fastapi import APIRouter, HTTPException

from app.dependencies import get_run_store
from app.models.run import RunRecord


router = APIRouter(prefix='/agents', tags=['agents'])


@router.get('/runs/{run_id}', response_model=RunRecord)
async def get_run(run_id: str) -> RunRecord:
    run = await get_run_store().get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail='Run not found')
    return run
