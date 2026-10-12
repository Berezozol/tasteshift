# TasteShift

Cross-category discovery: FastAPI + PostgreSQL backend grounded in Qloo, optional Gemini agent (Pydantic AI), React 19 + Vite frontend. See README.md for product behavior and API.

## Layout

- `backend/src/tasteshift/` — `main.py` (app factory `create_app`, no import-time app), `api/` (routers `health`, `entities`, `discoveries` + FastAPI dependencies in `deps.py`), `repositories.py` (sessions, idempotent discovery snapshots, feedback), `errors.py` (exception handlers), `discovery.py` (orchestration: `_fetch` → `_select` → `_attach_evidence`, budgets), `ranking.py`, `qloo.py` (provider client/parsing), `agent.py` (Pydantic AI agent + admission), `domain.py` (Pydantic models), `storage.py` (SQLAlchemy), `config.py` (settings).
- Handlers that call providers take `SessionmakerDep` and open short DB sessions; others use `DbDep`. Don't hold a DB connection across Qloo/Gemini calls.
- `backend/tests/` — SQLite by default; `FakeQloo` in `conftest.py` provides synthetic provider responses. `test_smoke.py` (marker `smoke`), `test_regressions.py`, opt-in live tests in `test_live.py`.
- `frontend/src/` — `App.tsx` (composition and page state), `components/` (`OrbitSystem`, `Controls`, `DetailPanel`, `SeedPicker`, `PickDialog`, `SavedDialog`, `Dialog`), `hooks/` (`useDiscovery` — requests + idempotency key reuse, `useSavedPicks`, `useMotion`/`useParallax`), `lib/planets.ts`, `api.ts`, tests in `src/test/` (they mock `../api`). Keep `.openai/hosting.json`, `worker/`, `scripts/prepare-sites-build.mjs` intact (Sites hosting; see `frontend/AGENTS.md`).
- `docs/` — design, architecture, `test-strategy.md`.

## Commands (Windows, PowerShell)

Backend, from `backend/`:

```powershell
uv sync --frozen --python "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
uv run ruff check . ; uv run ruff format --check .
uv run python -m pytest -q -W error          # full suite (live tests skip)
uv run python -m pytest -m smoke -q
uv run alembic upgrade head                  # needs Postgres (docker compose -p tasteshift-dev up -d --wait)
uv run python -m uvicorn --factory tasteshift.main:create_app --host 127.0.0.1 --port 8000
```

Frontend, from `frontend/`: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:smoke`, `npm run dev -- --port 4173 --strictPort`.

## Machine gotchas

- Smart App Control blocks unsigned executables: uv's standalone CPython and venv console-script shims (`pytest.exe`, `uvicorn.exe`, `alembic.exe`). Use the signed python.org interpreter above and invoke tools as `python -m <tool>`.
- `core.autocrlf=true`: `npm run format:check` reports CRLF-only diffs locally; verify with `npx prettier --check --end-of-line auto src vite.config.mjs`. CI (Linux) is authoritative.
- README shell snippets are bash; in PowerShell set env vars as `$env:RUN_QLOO_LIVE="1"; ...`.

## Rules

- Never commit keys; `backend/.env` holds `QLOO_API_KEY`, optional `GEMINI_API_KEY`. Settings read `backend/.env` by absolute path.
- Runtime never substitutes fixture data for Qloo; synthetic responses live only in tests.
- Live tests (`RUN_QLOO_LIVE`, `RUN_AGENT_LIVE`, `tests.agent_eval --live`) consume quota — run only when asked.
- `TEST_DATABASE_URL` must end in `_test`; the suite drops its tables.
- Keep ruff (line length 100) and prettier clean; CI runs both plus `alembic check`.
