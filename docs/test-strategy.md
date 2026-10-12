# Стратегия тестирования TasteShift

## Цели

- Ловить регрессии в ранжировании, разборе ответов Qloo и контракте API раньше, чем их увидит пользователь.
- Держать основной набор быстрым, детерминированным и бесплатным: без сети, реальных ключей и платных вызовов модели.
- Отдельно и явно проверять живые интеграции (Qloo, Gemini) — только по запросу.
- Иметь короткий smoke-набор, который за секунды отвечает на вопрос «приложение вообще работает?».

## Пирамида

| Уровень | Где | Что покрывает | Пробелы |
|---|---|---|---|
| Unit | `test_ranking.py`, `test_qloo.py`, `test_taste_profile.py`, `test_model_adapter.py` | Ранжирование и уровни Safe→Wild, разбор сущностей/тегов/explainability, санитизация ошибок провайдера, валидация `domain.py` и `Settings` | Нет property-based тестов ранжирования; нет проверки границ полей `Settings` |
| Интеграция API + БД | `test_api.py`, `test_agent.py` через `conftest.py` | Сессии и cookie, Origin, Idempotency-Key, обратная связь, частичные отказы провайдера; SQLite по умолчанию, Postgres через `TEST_DATABASE_URL` | Нет тестов истечения сессии, общего дедлайна, миграций на SQLite |
| Оценка агента | `test_agent_eval.py` (офлайн, scripted model), `test_live.py` (`RUN_AGENT_LIVE=1`) | Соблюдение шортлиста, бюджетов и формата плана | Нет регулярного живого прогона и порогов качества |
| Frontend | `src/test/App.test.tsx`, `api.test.ts` (vitest + Testing Library + jsdom) | Превью без сети, поиск, повтор с тем же ключом, сохранение, motion | Нет e2e в реальном браузере и a11y-проверок (axe) |
| Worker | `tests/sites-worker.test.mjs` (`node --test`) | Статика и SPA-fallback | — |
| Smoke | `backend/tests/test_smoke.py`, `backend/scripts/smoke.py`, `src/test/smoke.test.tsx` | См. ниже | — |
| Live (opt-in) | `test_live.py` (`RUN_QLOO_LIVE=1`, `RUN_AGENT_LIVE=1`) | Реальные схемы Qloo и Gemini | Запускается вручную |

## Smoke-тесты

Smoke — минимальный набор «запуск + главный сценарий», не заменяет полный прогон.

- **Backend, in-process** (`pytest -m smoke`): приложение стартует; `/api/health` с точной формой ответа; `/api/ready` — 200 при созданной схеме и 503 `storage_unavailable` без неё; `/docs` и `/openapi.json` доступны и содержат все пути; поиск без ключа → 503 `provider_not_configured`; поиск и `POST /api/discoveries` на синтетическом Qloo; cookie `tasteshift_session` с HttpOnly; повтор с тем же Idempotency-Key возвращает тот же `id` без новых вызовов провайдера; чужой Origin → 403; обратная связь сохраняется.
- **Backend, против запущенного сервера** (`scripts/smoke.py`): `/api/health`, `/api/ready`, `/openapi.json`; ненулевой код выхода при ошибке; ключи не нужны.
- **Frontend** (`npm run test:smoke`): превью рендерится, `fetch` не вызывается, есть уровни Safe→Wild и «Make it yours», диалоги открываются.

Когда запускать: локально после старта сервера (`scripts/smoke.py`); в CI первым шагом каждого job (быстрый отказ); после каждого деплоя — `scripts/smoke.py <URL>` как gate перед переключением трафика.

## Окружения и данные

- Только синтетические фикстуры (`FakeQloo`, `scripted_model`); это не записи живого провайдера.
- Ключи в тестах — заведомо фиктивные (`test-key-never-real`); `ALLOW_MODEL_REQUESTS=False` для всех тестов.
- Реальные ключи — только в локальном `backend/.env` или секретах CI для opt-in живых прогонов; никогда в репозитории и фронтенде.
- Postgres для тестов — отдельная БД с именем на `_test` (проверяется в `conftest.py`).

## Рекомендации для CI

- Backend: матрица `db: [sqlite, postgres]` (сейчас только Postgres), Python 3.12; шаги: `pytest -m smoke` → полный `pytest -W error` → `alembic upgrade head && alembic check`.
- Frontend: Node 22 (+ текущий LTS в матрице); `test:smoke` → `typecheck` → `test` → `format:check` → `build` → `test:sites`.
- Живые тесты — отдельный workflow `workflow_dispatch`/nightly с секретами, не блокирует PR.
- После деплоя — job с `scripts/smoke.py` против продового URL.

## Регрессии известных проблем

В `backend/tests/test_regressions.py` — тесты на проблемы из ревью октября 2026; все исправлены в ветке `fix/review-stage-1`, тесты должны быть зелёными:

1. `agent.py` импортирует `httpx2` — пакет теперь объявлен в `pyproject.toml`; статическая проверка импортов.
2. Сохранённая сущность, которая перестала резолвиться через `/entities`, больше не ломает подборки (отбрасывается из сигналов).
3. Сохранённые элементы исключаются из следующих подборок.
4. `.env` читается по абсолютному пути `backend/.env`.
5. Импорт `main.py` не создаёт приложение; запуск через `uvicorn --factory tasteshift.main:create_app`.

## Покрытие и инструменты

- Цели: backend ≥ 85% строк (ranking/qloo ≥ 95%), frontend ≥ 80% для `api.ts` и `App.tsx`.
- `pytest-cov` (`--cov=tasteshift --cov-report=term-missing`), `@vitest/coverage-v8` (`vitest run --coverage`).
- Позже: Playwright для e2e (превью → поиск → подборка → сохранение) против docker-compose с синтетическим Qloo; `axe-core` для доступности.

## Запуск в Windows PowerShell

```powershell
# Backend (из каталога backend)
cd backend
uv sync
uv run pytest -m smoke -q             # smoke
uv run pytest -q -W error             # всё, кроме opt-in live
$env:TEST_DATABASE_URL = "postgresql+asyncpg://tasteshift:tasteshift@localhost:5432/tasteshift_test"
uv run pytest -q; Remove-Item Env:TEST_DATABASE_URL
$env:RUN_QLOO_LIVE = "1"; uv run pytest tests/test_live.py -q; Remove-Item Env:RUN_QLOO_LIVE

# Smoke против запущенного сервера
uv run uvicorn --factory tasteshift.main:create_app --host 127.0.0.1 --port 8000   # в отдельном окне
uv run python scripts/smoke.py http://127.0.0.1:8000

# Frontend (из каталога frontend)
cd ..\frontend
npm ci
npm run test:smoke
npm test
npm run test:sites
```
