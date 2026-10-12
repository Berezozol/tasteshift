# Developer commands. Run `just` to list them.
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# Prefer an installed (signed) Python over uv's downloaded builds, which
# Windows Smart App Control blocks.
export UV_PYTHON_PREFERENCE := "system"

[private]
default:
    @just --list

# Install backend and frontend dependencies from the lock files.
setup: setup-backend setup-frontend

[private]
[working-directory('backend')]
setup-backend:
    uv sync --frozen --python 3.12

[private]
[working-directory('frontend')]
setup-frontend:
    npm ci

# Start only PostgreSQL (for running the API and client on the host).
db:
    docker compose up -d --wait db

# Start the whole stack in Docker: database, migrations, API and client.
up:
    docker compose --profile app up -d --build --wait

# Stop all containers; data stays in the tasteshift_db volume.
down:
    docker compose --profile app down

# Apply database migrations to the local PostgreSQL.
[working-directory('backend')]
migrate:
    uv run python -m alembic upgrade head

# Run the API on the host with reload.
[working-directory('backend')]
api:
    uv run python -m uvicorn --factory tasteshift.main:create_app --host 127.0.0.1 --port 8000 --reload

# Run the Vite client on the host.
[working-directory('frontend')]
web:
    npm run dev -- --port 4173 --strictPort

# Lint and format checks, as in CI.
lint: lint-backend lint-frontend

[private]
[working-directory('backend')]
lint-backend:
    uv run ruff check .
    uv run ruff format --check .

[private]
[working-directory('frontend')]
lint-frontend:
    npm run typecheck
    npm run format:check

# Apply formatters.
fmt: fmt-backend fmt-frontend

[private]
[working-directory('backend')]
fmt-backend:
    uv run ruff check --fix .
    uv run ruff format .

[private]
[working-directory('frontend')]
fmt-frontend:
    npx prettier --write src vite.config.mjs

# Full offline test suites (no provider calls).
test: test-backend test-frontend

[private]
[working-directory('backend')]
test-backend:
    uv run python -m pytest -q -W error

[private]
[working-directory('frontend')]
test-frontend:
    npm test

# Fast smoke tests, plus HTTP checks against a running API.
smoke url="http://127.0.0.1:8000": smoke-tests
    cd backend; uv run python scripts/smoke.py {{url}}

[private]
smoke-tests:
    cd backend; uv run python -m pytest -m smoke -q
    cd frontend; npm run test:smoke
