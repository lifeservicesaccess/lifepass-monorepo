from pydantic import BaseModel, Field


class ContinueRequest(BaseModel):
    run_id: str = Field(alias='runId')
    decision: str
    actor: str
    notes: str | None = None
