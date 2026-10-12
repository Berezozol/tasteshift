# TasteShift

Cross-category discovery: FastAPI + PostgreSQL backend grounded in Qloo, optional Gemini agent (Pydantic AI), React 19 + Vite frontend. See README.md for product behavior and API.

## Layout

- `backend/src/tasteshift/` — `main.py` (app factory `create_app`, no import-time app), `api/` (routers `health`, `entities`, `discoveries` + FastAPI dependencies in `deps.py`), `repositories.py` (sessions, idempotent discovery snapshots, feedback), `errors.py` (exception handlers), `discovery.py` (orchestration: `_fetch` → `_select` → `_attach_evidence`, budgets), `ranking.py`, `qloo.py` (provider client/parsing), `agent.py` (Pydantic AI agent + admission), `domain.py` (Pydantic models), `storage.py` (SQLAlchemy), `config.py` (settings).
- Handlers that call providers take `SessionmakerDep` and open short DB sessions; others use `DbDep`. Don't hold a DB connection across Qloo/Gemini calls.
- `backend/tests/` — SQLite by default; `FakeQloo` in `conftest.py` provides synthetic provider responses. `test_smoke.py` (marker `smoke`), `test_regressions.py`, opt-in live tests in `test_live.py`.
- `frontend/src/` — `App.tsx` (composition and page state), `components/` (`OrbitSystem`, `Controls`, `DetailPanel`, `SeedPicker`, `PickDialog`, `SavedDialog`, `Dialog`), `hooks/` (`useDiscovery` — requests + idempotency key reuse, `useSavedPicks`, `useMotion`/`useParallax`), `lib/planets.ts`, `api.ts`, tests in `src/test/` (they mock `../api`). Keep `.openai/hosting.json`, `worker/`, `scripts/prepare-sites-build.mjs` intact (Sites hosting; see `frontend/AGENTS.md`).
- `docs/` — design, architecture, `test-strategy.md`.

## Commands (Windows, PowerShell)

`just` (repo root) wraps everything: `just setup | db | up | down | migrate | api | web | lint | fmt | test | smoke [url]`. Recipes run in PowerShell and set `UV_PYTHON_PREFERENCE=system`.

- Full stack in Docker: `docker compose --profile app up -d --build --wait` (db, migrate, backend :8000, frontend :4173; keys from `backend/.env`). Plain `docker compose up -d --wait db` starts only PostgreSQL. Compose project name is `tasteshift-dev`.
- Backend, from `backend/`: `uv sync --frozen --python 3.12`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run python -m pytest -q -W error [--cov]`, `uv run python -m pytest -m smoke -q`, `uv run python -m alembic upgrade head`, `uv run python -m uvicorn --factory tasteshift.main:create_app --host 127.0.0.1 --port 8000`, `uv run python scripts/smoke.py http://127.0.0.1:8000`.
- Frontend, from `frontend/`: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run test:smoke`, `npm run format:check`, `npm run dev -- --port 4173 --strictPort`.
- Env template: `backend/.env.example` → `backend/.env`.
- CI: `backend.yml`, `frontend.yml`, `agent-spike.yml` and `stack.yml` (Compose boot + smoke) run on path-filtered push/PR and `workflow_dispatch`.

## Machine gotchas

- Smart App Control blocks unsigned executables: uv's standalone CPython and venv console-script shims (`pytest.exe`, `uvicorn.exe`, `alembic.exe`). Use the signed python.org interpreter above and invoke tools as `python -m <tool>`.
- Line endings: `.gitattributes` (`eol=lf`) keeps LF in every checkout, overriding the system Git `core.autocrlf=true`. Write new files with LF.
- README shell snippets are bash; in PowerShell set env vars as `$env:RUN_QLOO_LIVE="1"; ...`.

## Rules

- Never commit keys; `backend/.env` holds `QLOO_API_KEY`, optional `GEMINI_API_KEY`. Settings read `backend/.env` by absolute path.
- Runtime never substitutes fixture data for Qloo; synthetic responses live only in tests.
- Live tests (`RUN_QLOO_LIVE`, `RUN_AGENT_LIVE`, `tests.agent_eval --live`) consume quota — run only when asked.
- `TEST_DATABASE_URL` must end in `_test`; the suite drops its tables.
- Keep ruff (line length 100) and prettier clean; CI runs both plus `alembic check`.
