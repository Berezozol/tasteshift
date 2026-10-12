"""Regressions for issues found in the October 2026 code review (see docs/test-strategy.md)."""

import ast
import re
import tomllib
from pathlib import Path

import httpx

from tasteshift import main
from tasteshift.config import Settings

from .test_api import discover

BACKEND = Path(__file__).resolve().parents[1]
SOURCE = BACKEND / "src" / "tasteshift"


async def save(client, discovery, entity_id):
    return await client.post(
        f"/api/discoveries/{discovery['id']}/feedback",
        json={"entity_id": entity_id, "action": "save"},
    )


def test_imported_httpx2_is_a_declared_dependency():
    imported = set()
    for path in SOURCE.glob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                imported.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
                imported.add(node.module.split(".")[0])
    project = tomllib.loads((BACKEND / "pyproject.toml").read_text(encoding="utf-8"))
    declared = {
        re.split(r"[\s<>=!~;\[]", requirement, maxsplit=1)[0].lower().replace("-", "_")
        for requirement in project["project"]["dependencies"]
    }
    assert "httpx2" not in imported or "httpx2" in declared


async def test_unresolvable_saved_item_does_not_break_later_discoveries(
    client, fake, body, monkeypatch
):
    first = (await discover(client, body)).json()
    saved = first["items"][0]["entity"]["id"]
    assert (await save(client, first, saved)).status_code == 200

    original = type(fake).__call__

    def without_saved(self, request):
        response = original(self, request)
        if request.url.path != "/entities":
            return response
        rows = [row for row in response.json()["results"] if row["entity_id"] != saved]
        return httpx.Response(200, json={"results": rows})

    monkeypatch.setattr(type(fake), "__call__", without_saved)
    response = await discover(client, body, "after-save")
    assert response.status_code == 200


async def test_saved_item_is_not_recommended_again(client, body):
    first = (await discover(client, body)).json()
    saved = first["items"][0]["entity"]["id"]
    assert (await save(client, first, saved)).status_code == 200
    second = await discover(client, body, "after-save")
    assert second.status_code == 200
    assert saved not in {item["entity"]["id"] for item in second.json()["items"]}


def test_env_file_does_not_depend_on_working_directory():
    env_file = Settings.model_config.get("env_file")
    paths = [] if env_file is None else [env_file] if isinstance(env_file, str | Path) else env_file
    assert all(Path(path).is_absolute() for path in paths)


def test_importing_main_does_not_build_an_app():
    # Served with `uvicorn --factory tasteshift.main:create_app`; import has no side effects.
    assert not hasattr(main, "app")
