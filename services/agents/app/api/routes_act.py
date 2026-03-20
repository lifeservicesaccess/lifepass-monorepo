from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.config import get_settings
from app.dependencies import get_intake_graph, get_run_store
from app.models.act_request import ActRequest, ActResponse
from app.models.run import ApprovalEnvelope, RunRecord


router = APIRouter(prefix='/agents', tags=['agents'])


@router.post('/act', response_model=ActResponse)
async def act(request: ActRequest) -> ActResponse:
    run_id = str(uuid.uuid4())
    request_id = str(uuid.uuid4())
    graph = get_intake_graph()
    initial_state = {
        'run_id': run_id,
        'user_id': request.user_id,
        'request_id': request_id,
        'channel': request.channel,
        'input_text': request.input,
        'intent': 'unknown',
        'recommended_portal': None,
        'trust_level': None,
        'trust_score': None,
        'sso_token': None,
        'plan': [],
        'requires_human_approval': False,
        'approval_status': None,
        'action_results': [],
        'next_steps': [],
        'errors': [],
        'metadata': request.metadata,
        'status': 'received'
    }
    result = await graph.ainvoke(initial_state)
    run_store = get_run_store()
    run = RunRecord(
        runId=result['run_id'],
        userId=result['user_id'],
        requestId=result['request_id'],
        channel=result['channel'],
        inputText=result['input_text'],
        intent=result['intent'],
        status=result['status'],
        recommendedPortal=result['recommended_portal'],
        trustLevel=result['trust_level'],
        trustScore=result['trust_score'],
        ssoToken=result['sso_token'],
        plan=result['plan'],
        requiresHumanApproval=result['requires_human_approval'],
        approvalStatus=result['approval_status'],
        actionResults=result['action_results'],
        nextSteps=result['next_steps'],
        errors=result['errors'],
        metadata=result['metadata']
    )
    settings = get_settings()
    if run.status == 'waiting_approval':
        approval = ApprovalEnvelope(
            runId=run.run_id,
            continueUrl=settings.n8n_continue_webhook_url,
            payload={
                'runId': run.run_id,
                'decision': 'approved',
                'actor': settings.admin_actor,
                'notes': 'Approved via n8n steward workflow'
            }
        )
        run.metadata['approval'] = approval.model_dump(by_alias=True)

    await run_store.save(run)
    await run_store.save_checkpoint(run.run_id, 'act_completed', result)
    return ActResponse(
        runId=run.run_id,
        status=run.status,
        intent=run.intent,
        recommendedPortal=run.recommended_portal,
        nextSteps=run.next_steps,
        actionResults=run.action_results
    )
