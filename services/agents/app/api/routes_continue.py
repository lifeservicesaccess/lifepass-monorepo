from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.dependencies import get_api_client, get_run_store
from app.models.continue_request import ContinueRequest
from app.models.run import ContinueResponse
from app.nodes.execute_api_action import execute_api_action
from app.nodes.finalize_run import finalize_run


router = APIRouter(prefix='/agents', tags=['agents'])


@router.post('/continue', response_model=ContinueResponse)
async def continue_run(request: ContinueRequest) -> ContinueResponse:
    run_store = get_run_store()
    run = await run_store.get(request.run_id)
    if not run:
        raise HTTPException(status_code=404, detail='Run not found')

    if request.decision.lower() != 'approved':
        run.status = 'rejected'
        run.approval_status = 'rejected'
        run.next_steps = ['Human steward rejected this run.']
        await run_store.save(run)
        await run_store.save_checkpoint(run.run_id, 'continue_rejected', {'decision': request.decision, 'actor': request.actor})
        return ContinueResponse(runId=run.run_id, status=run.status, actionResults=run.action_results, nextSteps=run.next_steps)

    state = {
        'run_id': run.run_id,
        'user_id': run.user_id,
        'request_id': run.request_id,
        'channel': run.channel,
        'input_text': run.input_text,
        'intent': run.intent,
        'recommended_portal': run.recommended_portal,
        'trust_level': run.trust_level,
        'trust_score': run.trust_score,
        'sso_token': run.sso_token,
        'plan': run.plan,
        'requires_human_approval': False,
        'approval_status': 'approved',
        'action_results': run.action_results,
        'next_steps': run.next_steps,
        'errors': run.errors,
        'metadata': run.metadata,
        'status': 'approved'
    }
    state = await execute_api_action(state, get_api_client())
    state = finalize_run(state)

    run.status = state['status']
    run.approval_status = 'approved'
    run.action_results = state['action_results']
    run.next_steps = state['next_steps']
    run.errors = state['errors']
    run.sso_token = state['sso_token']
    run.metadata['approvalDecision'] = {'decision': request.decision, 'actor': request.actor, 'notes': request.notes}
    await run_store.save(run)
    await run_store.save_checkpoint(run.run_id, 'continue_completed', state)
    return ContinueResponse(runId=run.run_id, status=run.status, actionResults=run.action_results, nextSteps=run.next_steps)
