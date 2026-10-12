from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from tasteshift import repositories
from tasteshift.api.deps import (
    DbDep,
    SessionDep,
    SessionmakerDep,
    SettingsDep,
    ensure_session,
    require_origin,
)
from tasteshift.discovery import UnresolvedInterests, feedback_signals
from tasteshift.domain import Discovery, DiscoveryRequest, FeedbackRequest
from tasteshift.qloo import ProviderError

router = APIRouter(prefix="/api/discoveries")


def idempotency_conflict() -> HTTPException:
    return HTTPException(409, "Idempotency-Key already used for another request")


@router.post("", response_model=Discovery, dependencies=[Depends(require_origin)])
async def discover(
    body: DiscoveryRequest,
    request: Request,
    response: Response,
    settings: SettingsDep,
    sessions: SessionmakerDep,
):
    request_key = request.headers.get("idempotency-key")
    if not request_key or not 1 <= len(request_key) <= 64:
        raise HTTPException(422, "Provide an Idempotency-Key of 1–64 characters")
    state = request.app.state
    # Fail before any provider call when a required dependency is not configured.
    if body.intent is not None and state.runner is None:
        raise ProviderError("agent_not_configured")
    if not settings.qloo_api_key:
        raise ProviderError("provider_not_configured")
    input_hash = repositories.digest(body.model_dump_json(exclude_none=True))
    async with sessions() as db:
        session_id = await ensure_session(db, request, response, settings)
        try:
            saved = await repositories.replay_discovery(db, session_id, request_key, input_hash)
        except repositories.IdempotencyConflict:
            raise idempotency_conflict() from None
        if saved is not None:
            return saved
        feedback = await repositories.session_feedback(db, session_id)
    excluded, positives = feedback_signals(body, feedback)
    try:
        if body.intent:
            async with state.admission.enter(session_id):
                discovery = await state.discovery.create(body, excluded, positives)
        else:
            discovery = await state.discovery.create(body, excluded, positives)
    except UnresolvedInterests as exc:
        raise HTTPException(422, "Some interests could not be resolved") from exc
    async with sessions() as db:
        try:
            return await repositories.save_discovery(
                db, session_id, request_key, input_hash, discovery
            )
        except repositories.IdempotencyConflict:
            raise idempotency_conflict() from None


@router.get("/{id}", response_model=Discovery)
async def retrieve(id: UUID, db: DbDep, session_id: SessionDep):
    record = await repositories.owned_discovery(db, id, session_id)
    if record is None:
        raise HTTPException(404, "Discovery not found")
    return record.result


@router.post("/{id}/feedback", dependencies=[Depends(require_origin)])
async def react(id: UUID, body: FeedbackRequest, db: DbDep, session_id: SessionDep):
    record = await repositories.owned_discovery(db, id, session_id)
    if record is None:
        raise HTTPException(404, "Discovery not found")
    if str(body.entity_id) not in {item["entity"]["id"] for item in record.result["items"]}:
        raise HTTPException(422, "Choose an item from this discovery")
    await repositories.record_feedback(db, session_id, id, body.entity_id, body.action)
    return {"status": "saved"}
