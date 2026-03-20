from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RunRecord(BaseModel):
    run_id: str = Field(alias='runId')
    user_id: str = Field(alias='userId')
    request_id: str = Field(alias='requestId')
    channel: str
    input_text: str = Field(alias='inputText')
    intent: str = 'unknown'
    status: str = 'received'
    recommended_portal: str | None = Field(default=None, alias='recommendedPortal')
    trust_level: str | None = Field(default=None, alias='trustLevel')
    trust_score: int | None = Field(default=None, alias='trustScore')
    sso_token: str | None = Field(default=None, alias='ssoToken')
    plan: list[dict[str, Any]] = Field(default_factory=list)
    requires_human_approval: bool = Field(default=False, alias='requiresHumanApproval')
    approval_status: str | None = Field(default=None, alias='approvalStatus')
    action_results: list[dict[str, Any]] = Field(default_factory=list, alias='actionResults')
    next_steps: list[str] = Field(default_factory=list, alias='nextSteps')
    errors: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=utc_now, alias='createdAt')
    updated_at: str = Field(default_factory=utc_now, alias='updatedAt')


class ContinueResponse(BaseModel):
    success: bool = True
    run_id: str = Field(alias='runId')
    status: str
    action_results: list[dict[str, Any]] = Field(default_factory=list, alias='actionResults')
    next_steps: list[str] = Field(default_factory=list, alias='nextSteps')


class ApprovalEnvelope(BaseModel):
    run_id: str = Field(alias='runId')
    continue_url: str | None = Field(default=None, alias='continueUrl')
    payload: dict[str, Any] = Field(default_factory=dict)

