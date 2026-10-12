"""Fast smoke checks: the app starts and its main user journey works end to end.

Run only these with `uv run pytest -m smoke -q`. Providers are synthetic (see conftest).
"""

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import select

from tasteshift.config import Settings
from tasteshift.main import create_app
from tasteshift.storage import FeedbackRecord

from .test_api import discover

pytestmark = pytest.mark.smoke


async def test_health_reports_configuration_without_secrets(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "qloo_configured": True,
        "agent_configured": False,
    }
    assert "test-key" not in response.text


async def test_ready_with_created_schema(client):
    response = await client.get("/api/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


async def test_ready_fails_clearly_without_schema(tmp_path):
    settings = Settings(
        _env_file=None,
        qloo_api_key=None,
        database_url=SecretStr(f"sqlite+aiosqlite:///{tmp_path}/empty.db"),
    )
    application = create_app(settings)
    async with application.router.lifespan_context(application):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application),
            base_url="http://localhost:8000",
        ) as client:
            response = await client.get("/api/ready")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "storage_unavailable"


async def test_docs_and_openapi_are_reachable(client):
    docs = await client.get("/docs")
    assert docs.status_code == 200
    assert "text/html" in docs.headers["content-type"]
    schema = await client.get("/openapi.json")
    assert schema.status_code == 200
    paths = schema.json()["paths"]
    for path in [
        "/api/health",
        "/api/ready",
        "/api/entities/search",
        "/api/discoveries",
        "/api/discoveries/{id}",
        "/api/discoveries/{id}/feedback",
    ]:
        assert path in paths


async def test_search_without_key_reports_provider_not_configured(tmp_path):
    settings = Settings(
        _env_file=None,
        qloo_api_key=None,
        database_url=SecretStr(f"sqlite+aiosqlite:///{tmp_path}/nokey.db"),
    )
    application = create_app(settings)
    async with application.router.lifespan_context(application):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application),
            base_url="http://localhost:8000",
        ) as client:
            health = await client.get("/api/health")
            response = await client.get("/api/entities/search", params={"q": "Bowie"})
    assert health.json()["qloo_configured"] is False
    assert response.status_code == 503
    assert response.json() == {"detail": {"code": "provider_not_configured"}}


async def test_search_happy_path(client, fake):
    response = await client.get("/api/entities/search", params={"q": "Bowie", "category": "movie"})
    assert response.status_code == 200
    items = response.json()["items"]
    assert items and items[0]["category"] == "movie"
    assert fake.calls[-1].headers["X-Api-Key"] == "test-key-never-real"
    assert "test-key" not in response.text


async def test_discovery_happy_path_sets_session_cookie(client, body):
    response = await discover(client, body, "smoke-first")
    assert response.status_code == 200
    payload = response.json()
    assert payload["items"]
    assert {item["category"] for item in payload["coverage"]} == {"artist", "movie", "book"}
    cookie = response.headers["set-cookie"].lower()
    assert "tasteshift_session=" in cookie
    assert "httponly" in cookie
    assert "test-key" not in response.text


async def test_discovery_replay_returns_same_result_without_provider_calls(client, fake, body):
    first = (await discover(client, body, "smoke-replay")).json()
    calls = len(fake.calls)
    replay = await discover(client, body, "smoke-replay")
    assert replay.status_code == 200
    assert replay.json()["id"] == first["id"]
    assert len(fake.calls) == calls
    stored = await client.get(f"/api/discoveries/{first['id']}")
    assert stored.status_code == 200
    assert stored.json() == first


async def test_wrong_origin_is_rejected_before_provider_calls(client, fake, body):
    response = await client.post(
        "/api/discoveries",
        json=body,
        headers={"Origin": "https://unrelated.example", "Idempotency-Key": "smoke-origin"},
    )
    assert response.status_code == 403
    assert not fake.calls


async def test_feedback_round_trip(client, app, body):
    payload = (await discover(client, body, "smoke-feedback")).json()
    entity_id = payload["items"][0]["entity"]["id"]
    path = f"/api/discoveries/{payload['id']}/feedback"
    foreign = await client.post(
        path,
        json={"entity_id": entity_id, "action": "save"},
        headers={"Origin": "https://unrelated.example"},
    )
    assert foreign.status_code == 403
    response = await client.post(path, json={"entity_id": entity_id, "action": "save"})
    assert response.status_code == 200
    assert response.json() == {"status": "saved"}
    async with app.state.engine.connect() as db:
        stored = (await db.execute(select(FeedbackRecord.entity_id, FeedbackRecord.action))).all()
    assert [tuple(row) for row in stored] == [(entity_id, "save")]
