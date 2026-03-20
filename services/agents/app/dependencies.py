from functools import lru_cache

from app.config import get_settings
from app.graphs.lifepass_intake_graph import build_lifepass_intake_graph
from app.memory.run_store import InMemoryRunStore, PostgresRunStore
from app.tools.lifepass_api import LifePassApiClient


@lru_cache
def get_api_client() -> LifePassApiClient:
    return LifePassApiClient(get_settings())


@lru_cache
def get_run_store():
    settings = get_settings()
    if settings.database_url:
        return PostgresRunStore(settings.database_url)
    return InMemoryRunStore()


@lru_cache
def get_intake_graph():
    return build_lifepass_intake_graph(get_api_client())
