from fastapi import APIRouter, Request
from sqlalchemy import select, text

from tasteshift.api.deps import SettingsDep
from tasteshift.storage import SessionRecord

router = APIRouter(prefix="/api")


@router.get("/health")
async def health(request: Request, settings: SettingsDep):
    return {
        "status": "ok",
        "qloo_configured": bool(settings.qloo_api_key),
        "agent_configured": request.app.state.runner is not None,
    }


@router.get("/ready")
async def ready(request: Request):
    async with request.app.state.engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
        await connection.execute(select(SessionRecord.id).limit(1))
    return {"status": "ready"}
