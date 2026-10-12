from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tasteshift import repositories
from tasteshift.config import Settings

SESSION_COOKIE = "tasteshift_session"


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_sessionmaker(request: Request) -> async_sessionmaker[AsyncSession]:
    return request.app.state.sessions


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.sessions() as db:
        yield db


SettingsDep = Annotated[Settings, Depends(get_settings)]
# For handlers that call providers: open short sessions instead of holding a
# connection for the whole request.
SessionmakerDep = Annotated[async_sessionmaker[AsyncSession], Depends(get_sessionmaker)]
DbDep = Annotated[AsyncSession, Depends(get_db)]


def require_origin(request: Request, settings: SettingsDep) -> None:
    if request.headers.get("origin") != settings.app_origin:
        raise HTTPException(403, "Invalid request origin")


async def current_session(request: Request, db: DbDep) -> str:
    session_id = await repositories.find_session(db, request.cookies.get(SESSION_COOKIE))
    if session_id is None:
        raise HTTPException(404, "Discovery not found")
    return session_id


SessionDep = Annotated[str, Depends(current_session)]


async def ensure_session(
    db: AsyncSession, request: Request, response: Response, settings: Settings
) -> str:
    """Reuse the caller's valid session or start a new one and set its cookie."""
    session_id = await repositories.find_session(db, request.cookies.get(SESSION_COOKIE))
    if session_id is not None:
        return session_id
    session_id, token = await repositories.create_session(db, settings.session_days)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_days * 86400,
    )
    return session_id
