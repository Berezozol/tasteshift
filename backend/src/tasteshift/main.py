from contextlib import AsyncExitStack, asynccontextmanager

import httpx
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from tasteshift import errors
from tasteshift.agent import AgentAdmission, AgentRunner
from tasteshift.api import discoveries, entities, health
from tasteshift.config import Settings
from tasteshift.discovery import DiscoveryService
from tasteshift.model import gemini_model
from tasteshift.qloo import QlooClient


def create_app(settings: Settings | None = None, transport=None, *, agent_model=None) -> FastAPI:
    """Serve with `uvicorn --factory tasteshift.main:create_app`."""
    settings = settings or Settings()
    engine = create_async_engine(settings.database_url.get_secret_value())

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(
            base_url=settings.qloo_base_url,
            timeout=settings.qloo_timeout,
            transport=transport,
            follow_redirects=False,
        ) as http:
            key = settings.qloo_api_key.get_secret_value() if settings.qloo_api_key else None
            app.state.qloo = QlooClient(http, key)
            async with AsyncExitStack() as stack:
                stack.push_async_callback(engine.dispose)
                model = agent_model
                if model is None and settings.gemini_api_key:
                    model = await stack.enter_async_context(gemini_model(settings))
                app.state.runner = AgentRunner(settings, model) if model is not None else None
                app.state.admission = AgentAdmission(settings)
                app.state.discovery = DiscoveryService(settings, app.state.qloo, app.state.runner)
                yield

    app = FastAPI(title="TasteShift", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessions = async_sessionmaker(engine, expire_on_commit=False)
    errors.register(app)
    for module in (health, entities, discoveries):
        app.include_router(module.router)
    return app
