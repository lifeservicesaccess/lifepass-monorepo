from fastapi import APIRouter

from app.config import get_settings


router = APIRouter(tags=['health'])


@router.get('/health')
async def health() -> dict[str, object]:
    settings = get_settings()
    return {
        'success': True,
        'service': settings.service_name,
        'apiBaseUrl': settings.api_base_url
    }
