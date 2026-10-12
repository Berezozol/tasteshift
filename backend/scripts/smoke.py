"""HTTP smoke check for a running TasteShift API. Needs no provider keys.

Usage:
    uv run python scripts/smoke.py [BASE_URL]

BASE_URL defaults to $TASTESHIFT_BASE_URL or http://127.0.0.1:8000.
Exits 0 when every check passes and 1 otherwise.
"""

import os
import sys

import httpx

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
EXPECTED_PATHS = {"/api/health", "/api/ready", "/api/entities/search", "/api/discoveries"}


def check_health(client: httpx.Client) -> str:
    payload = client.get("/api/health").raise_for_status().json()
    if payload.get("status") != "ok":
        raise AssertionError(f"unexpected status {payload.get('status')!r}")
    qloo, agent = payload.get("qloo_configured"), payload.get("agent_configured")
    return f"qloo_configured={qloo} agent_configured={agent}"


def check_ready(client: httpx.Client) -> str:
    payload = client.get("/api/ready").raise_for_status().json()
    if payload.get("status") != "ready":
        raise AssertionError(f"unexpected status {payload.get('status')!r}")
    return "database reachable, schema present"


def check_openapi(client: httpx.Client) -> str:
    paths = set(client.get("/openapi.json").raise_for_status().json().get("paths", {}))
    missing = EXPECTED_PATHS - paths
    if missing:
        raise AssertionError(f"missing paths {sorted(missing)}")
    return f"{len(paths)} paths"


CHECKS = [
    ("GET /api/health", check_health),
    ("GET /api/ready", check_ready),
    ("GET /openapi.json", check_openapi),
]


def main(argv: list[str]) -> int:
    env_url = os.environ.get("TASTESHIFT_BASE_URL", DEFAULT_BASE_URL)
    base_url = argv[1] if len(argv) > 1 else env_url
    failures = 0
    with httpx.Client(base_url=base_url.rstrip("/"), timeout=10) as client:
        for name, check in CHECKS:
            try:
                detail = check(client)
            except (httpx.HTTPError, AssertionError, ValueError) as exc:
                failures += 1
                print(f"FAIL {name}: {type(exc).__name__}: {exc}")
            else:
                print(f"ok   {name}: {detail}")
    print(f"{len(CHECKS) - failures}/{len(CHECKS)} checks passed against {base_url}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
