from fastapi import FastAPI

from app.api.routes_act import router as act_router
from app.api.routes_continue import router as continue_router
from app.api.routes_health import router as health_router
from app.api.routes_runs import router as runs_router
from app.config import get_settings


settings = get_settings()
app = FastAPI(title=settings.service_name, version='0.1.0')
app.include_router(health_router)
app.include_router(act_router)
app.include_router(continue_router)
app.include_router(runs_router)
