from typing import Any

from pydantic import BaseModel, Field


class ActRequest(BaseModel):
    user_id: str = Field(alias='userId')
    input: str
    channel: str = 'web'
    metadata: dict[str, Any] = Field(default_factory=dict)


class ActResponse(BaseModel):
    success: bool = True
    run_id: str = Field(alias='runId')
    status: str
    intent: str
    recommended_portal: str | None = Field(default=None, alias='recommendedPortal')
    next_steps: list[str] = Field(default_factory=list, alias='nextSteps')
    action_results: list[dict[str, Any]] = Field(default_factory=list, alias='actionResults')
