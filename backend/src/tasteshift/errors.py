from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from tasteshift.qloo import ProviderError


async def provider_error(request: Request, exc: ProviderError) -> JSONResponse:
    status = 429 if exc.code == "agent_rate_limit" else 503
    return JSONResponse(status_code=status, content={"detail": {"code": exc.code}})


async def database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": {"code": "storage_unavailable"}})


def register(app: FastAPI) -> None:
    app.add_exception_handler(ProviderError, provider_error)
    app.add_exception_handler(SQLAlchemyError, database_error)
