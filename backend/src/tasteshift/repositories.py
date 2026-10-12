"""Persistence for guest sessions, discovery snapshots and feedback."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from tasteshift.domain import Discovery, FeedbackAction
from tasteshift.storage import DiscoveryRecord, FeedbackRecord, SessionRecord


class IdempotencyConflict(Exception):
    """The Idempotency-Key was already used for a different request body."""


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def find_session(db: AsyncSession, token: str | None) -> str | None:
    if not token:
        return None
    return await db.scalar(
        select(SessionRecord.id).where(
            SessionRecord.token_hash == digest(token),
            SessionRecord.expires_at > datetime.now(UTC),
        )
    )


async def create_session(db: AsyncSession, days: int) -> tuple[str, str]:
    """Return the new session ID and its raw token; only the token hash is stored."""
    token = secrets.token_urlsafe(32)
    record = SessionRecord(
        id=str(uuid4()),
        token_hash=digest(token),
        expires_at=datetime.now(UTC) + timedelta(days=days),
    )
    db.add(record)
    await db.commit()
    return record.id, token


async def owned_discovery(db: AsyncSession, id: UUID, session_id: str) -> DiscoveryRecord | None:
    return await db.scalar(
        select(DiscoveryRecord).where(
            DiscoveryRecord.id == str(id),
            DiscoveryRecord.session_id == session_id,
        )
    )


async def session_feedback(db: AsyncSession, session_id: str) -> list[FeedbackRecord]:
    rows = await db.scalars(select(FeedbackRecord).where(FeedbackRecord.session_id == session_id))
    return list(rows.all())


def _keyed_discovery(session_id: str, request_key: str):
    return select(DiscoveryRecord).where(
        DiscoveryRecord.session_id == session_id,
        DiscoveryRecord.request_key == request_key,
    )


def _replay(record: DiscoveryRecord, input_hash: str) -> Discovery:
    if record.input_hash != input_hash:
        raise IdempotencyConflict
    return Discovery.model_validate(record.result)


async def replay_discovery(
    db: AsyncSession, session_id: str, request_key: str, input_hash: str
) -> Discovery | None:
    """Return the saved result for this key, or None if the key is unused."""
    record = await db.scalar(_keyed_discovery(session_id, request_key))
    return _replay(record, input_hash) if record else None


async def save_discovery(
    db: AsyncSession, session_id: str, request_key: str, input_hash: str, discovery: Discovery
) -> Discovery:
    """Store a new snapshot; a concurrent request with the same key wins and is replayed."""
    db.add(
        DiscoveryRecord(
            id=str(discovery.id),
            session_id=session_id,
            request_key=request_key,
            input_hash=input_hash,
            created_at=datetime.now(UTC),
            result=discovery.model_dump(mode="json"),
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await db.scalar(_keyed_discovery(session_id, request_key))
        if existing is None:
            raise
        return _replay(existing, input_hash)
    return discovery


async def record_feedback(
    db: AsyncSession, session_id: str, discovery_id: UUID, entity_id: UUID, action: FeedbackAction
) -> None:
    """Keep only the current action per entity and session."""
    query = select(FeedbackRecord).where(
        FeedbackRecord.session_id == session_id,
        FeedbackRecord.entity_id == str(entity_id),
    )
    item = await db.scalar(query)
    if item:
        item.action = action.value
        item.discovery_id = str(discovery_id)
    else:
        db.add(
            FeedbackRecord(
                id=str(uuid4()),
                session_id=session_id,
                discovery_id=str(discovery_id),
                entity_id=str(entity_id),
                action=action.value,
            )
        )
    try:
        await db.commit()
    except IntegrityError:
        # Another request may have inserted this same feedback key after our read.
        await db.rollback()
        existing = await db.scalar(query)
        if existing is None:
            raise
        existing.action = action.value
        existing.discovery_id = str(discovery_id)
        await db.commit()
