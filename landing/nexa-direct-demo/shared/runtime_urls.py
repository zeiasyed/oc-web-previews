"""Public URL helpers for local vs hosted demo."""

from __future__ import annotations

import os

from shared.constants import CONSOLE_PORT, RAVE_PORT


def edc_public_base() -> str:
    """Base URL for mock EDC — absolute locally, path prefix when behind nginx."""
    base = os.environ.get("EDC_PUBLIC_BASE", "").strip().rstrip("/")
    if base:
        return base
    return f"http://127.0.0.1:{RAVE_PORT}"


def console_bind_host() -> str:
    return os.environ.get("BIND_HOST", "127.0.0.1")


def rave_bind_host() -> str:
    return os.environ.get("BIND_HOST", "127.0.0.1")


def listen_port(default: int) -> int:
    key = "CONSOLE_PORT" if default == CONSOLE_PORT else "RAVE_PORT"
    return int(os.environ.get(key, default))
