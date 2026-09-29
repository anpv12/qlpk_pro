"""Production compose must provide the Redis session store the security gate requires."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_compose_app_environment_satisfies_production_session_gate() -> None:
    result = subprocess.run(
        [sys.executable, "scripts/check_security_config.py", "--compose", "docker-compose.yml"],
        cwd=ROOT, capture_output=True, text=True, timeout=120,
    )
    assert "SESSION_REDIS_URL or REALTIME_REDIS_URL is required" not in result.stdout, result.stdout


def test_app_waits_for_healthy_redis() -> None:
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert "SESSION_REDIS_URL=${SESSION_REDIS_URL:-redis://redis:6379/0}" in compose
    app_block = compose.split("\n  app:\n", 1)[1].split("\n  nginx:\n", 1)[0]
    assert "redis:\n        condition: service_healthy" in app_block
    redis_block = compose.split("\n  redis:\n", 1)[1]
    assert 'test: ["CMD", "redis-cli", "ping"]' in redis_block


def test_redis_port_is_published_on_loopback_only() -> None:
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    redis_block = compose.split("\n  redis:\n", 1)[1].split("\nvolumes:\n", 1)[0]
    published = [line.strip().strip('-" ') for line in redis_block.splitlines() if ":6379" in line and line.strip().startswith("-")]
    assert published, redis_block
    assert all(entry.startswith("127.0.0.1:") for entry in published), published
