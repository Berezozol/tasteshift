import asyncio
from dataclasses import dataclass
from uuid import UUID, uuid4

from tasteshift.config import Settings
from tasteshift.domain import (
    Candidate,
    Category,
    Coverage,
    Discovery,
    DiscoveryRequest,
    Entity,
    Evidence,
    TasteProfile,
)
from tasteshift.qloo import ProviderError, QlooClient
from tasteshift.ranking import rank


class UnresolvedInterests(Exception):
    pass


@dataclass
class RequestBudget:
    limit: int
    attempts: int = 0

    def reserve(self):
        if self.attempts >= self.limit:
            raise ProviderError("provider_budget_exhausted")
        self.attempts += 1


class BudgetedQloo:
    """A per-discovery budget; failed HTTP attempts consume it too."""

    def __init__(self, client: QlooClient, budget: RequestBudget):
        self.client = client
        self.budget = budget

    async def entities(self, ids):
        self.budget.reserve()
        return await self.client.entities(ids)

    async def candidates(self, seeds, category, excluded):
        self.budget.reserve()
        return await self.client.candidates(seeds, category, excluded)

    async def taste_tags(self, seeds):
        self.budget.reserve()
        return await self.client.taste_tags(seeds)


@dataclass
class Fetched:
    """Provider data for one discovery: resolved signals, per-category results, profile."""

    seeds: list[Entity]
    signal_ids: list[UUID]
    results: list[list[Candidate] | BaseException]
    profile: TasteProfile | None

    @property
    def profile_tags(self) -> set[str]:
        return {tag.id for tag in self.profile.tags} if self.profile else set()


class DiscoveryService:
    def __init__(self, settings: Settings, qloo: QlooClient, runner=None):
        self.settings = settings
        self.qloo = qloo
        self.runner = runner

    async def create(
        self, body: DiscoveryRequest, excluded: set[UUID], positives: list[UUID]
    ) -> Discovery:
        provider = BudgetedQloo(self.qloo, RequestBudget(self.settings.qloo_attempt_limit))
        deadline = asyncio.get_running_loop().time() + self.settings.discovery_timeout
        categories = body.intent.categories if body.intent else list(Category)
        try:
            async with asyncio.timeout_at(deadline):
                fetched = await self._fetch(provider, body, positives, excluded, categories)
        except TimeoutError as exc:
            raise ProviderError("provider_timeout") from exc
        discovery = Discovery(
            id=uuid4(), level=body.level, items=[], coverage=[], taste_profile=fetched.profile
        )
        pools = self._select(discovery, fetched, categories, excluded)
        if body.intent:
            self._attach_evidence(discovery, fetched, pools)
            if self.runner is None:
                raise ProviderError("agent_not_configured")
            discovery.agent = await self.runner.run(
                intent=body.intent,
                discovery=discovery,
                seeds=fetched.seeds,
                pools=pools,
                excluded=excluded,
                provider=provider,
                deadline=deadline,
            )
        return discovery

    async def _fetch(
        self,
        provider: BudgetedQloo,
        body: DiscoveryRequest,
        positives: list[UUID],
        excluded: set[UUID],
        categories: list[Category],
    ) -> Fetched:
        signal_ids = list(dict.fromkeys(body.seed_ids + positives))[:8]
        seeds = await provider.entities(signal_ids)
        resolved = {e.id for e in seeds}
        if not resolved <= set(signal_ids) or not set(body.seed_ids) <= resolved:
            raise UnresolvedInterests
        # A saved item the provider no longer resolves is dropped, not fatal.
        signal_ids = [id for id in signal_ids if id in resolved]
        calls = [provider.candidates(signal_ids, c, excluded) for c in categories]
        needs_profile = not any(seed.tags for seed in seeds)
        if needs_profile:
            calls.append(provider.taste_tags(signal_ids))
        results = await asyncio.gather(*calls, return_exceptions=True)
        profile = None
        if needs_profile:
            tags = results.pop()
            if isinstance(tags, ProviderError):
                profile = TasteProfile(status=tags.code, signal_ids=signal_ids)
            elif isinstance(tags, BaseException):
                raise tags
            else:
                profile = TasteProfile(
                    status="ready" if tags else "empty", signal_ids=signal_ids, tags=tags
                )
        return Fetched(seeds, signal_ids, results, profile)

    def _select(
        self,
        discovery: Discovery,
        fetched: Fetched,
        categories: list[Category],
        excluded: set[UUID],
    ) -> dict[Category, list[Candidate]]:
        """Rank each category pool into discovery items; return the trusted pools."""
        names = {seed.id: seed.name for seed in fetched.seeds}
        failures = []
        pools = {}
        seen = set(excluded)
        for category, result in zip(categories, fetched.results, strict=True):
            if isinstance(result, ProviderError):
                failures.append(result)
                discovery.coverage.append(Coverage(category=category, status=result.code))
                continue
            if isinstance(result, BaseException):
                raise result
            # Category is part of the trust boundary, not only a provider hint.
            pools[category] = [c for c in result if c.entity.category == category]
            selected, supported = rank(
                pools[category],
                fetched.seeds,
                seen,
                discovery.level,
                profile_tags=fetched.profile_tags,
            )
            by_id = {c.entity.id: c for c in pools[category]}
            for item in selected:
                contributions = by_id[item.entity.id].contributions
                if contributions:
                    related = ", ".join(
                        names[c.entity_id]
                        for c in sorted(contributions, key=lambda c: -c.score)[:3]
                    )
                    item.explanation = (
                        f"Qloo reports relative input contributions from {related}. "
                        "These are not probabilities that you will like this."
                    )
            discovery.items.extend(selected)
            seen.update(item.entity.id for item in selected)
            discovery.coverage.append(
                Coverage(
                    category=category,
                    status="ok" if selected else "empty",
                    exploration_supported=supported,
                )
            )
        if len(failures) == len(categories):
            raise failures[0]
        return pools

    @staticmethod
    def _attach_evidence(
        discovery: Discovery, fetched: Fetched, pools: dict[Category, list[Candidate]]
    ) -> None:
        candidates = {c.entity.id: c for pool in pools.values() for c in pool}
        source = "qloo_tag_insights" if fetched.profile_tags else "entity_metadata"
        discovery.evidence = [
            Evidence(
                id=f"{discovery.id}:{item.entity.id}",
                entity_id=item.entity.id,
                signal_ids=fetched.signal_ids,
                shared_tags=item.shared_tags,
                contributions=candidates[item.entity.id].contributions,
                explainability_status=candidates[item.entity.id].explainability_status,
                shared_tags_source=source,
            )
            for item in discovery.items
        ]


def feedback_signals(body: DiscoveryRequest, feedback) -> tuple[set[UUID], list[UUID]]:
    # Saved items stay positive signals but are never recommended again.
    excluded = set(body.seed_ids) | {UUID(item.entity_id) for item in feedback}
    positives = [UUID(item.entity_id) for item in feedback if item.action == "save"]
    return excluded, positives
