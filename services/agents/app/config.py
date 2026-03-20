from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    service_name: str = 'lifepass-agents'
    api_base_url: str = Field(default='http://localhost:3003', alias='AGENTS_API_BASE_URL')
    api_key: str | None = Field(default=None, alias='AGENTS_API_KEY')
    timeout_seconds: float = Field(default=20.0, alias='AGENTS_TIMEOUT_SECONDS')
    database_url: str | None = Field(default=None, alias='AGENTS_DATABASE_URL')
    n8n_continue_webhook_url: str | None = Field(default=None, alias='AGENTS_N8N_CONTINUE_WEBHOOK_URL')
    policy_admin_key_id: str | None = Field(default=None, alias='AGENTS_POLICY_ADMIN_KEY_ID')
    policy_admin_key: str | None = Field(default=None, alias='AGENTS_POLICY_ADMIN_KEY')
    admin_actor: str = Field(default='governance-admin', alias='AGENTS_ADMIN_ACTOR')


@lru_cache
def get_settings() -> Settings:
    return Settings()
