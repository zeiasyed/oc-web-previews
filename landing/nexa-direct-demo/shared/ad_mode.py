"""Ad recording mode state for NexaDirect 90s promo capture."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field

from shared.constants import AD_DEMO_FILE


@dataclass
class AdModeState:
    lock: threading.Lock = field(default_factory=threading.Lock)
    pre_upload: bool = True
    last_auto_count: int = 0

    def reset(self) -> None:
        with self.lock:
            self.pre_upload = True
            self.last_auto_count = 0

    def simulate_upload(self) -> None:
        with self.lock:
            self.pre_upload = False

    def is_pre_upload(self) -> bool:
        with self.lock:
            return self.pre_upload

    def set_auto_count(self, count: int) -> None:
        with self.lock:
            self.last_auto_count = count

    def get_auto_count(self) -> int:
        with self.lock:
            return self.last_auto_count


AD = AdModeState()


def ad_requested() -> bool:
    """Check query/body flag from Flask request context."""
    try:
        from flask import request

        if request.args.get("ad") in ("1", "true", "yes"):
            return True
        body = request.get_json(silent=True) or {}
        return bool(body.get("ad"))
    except RuntimeError:
        return False


def filter_inbox_files(files: list[dict], ad: bool) -> list[dict]:
    if not ad:
        return files
    if AD.is_pre_upload():
        return []
    return [f for f in files if f.get("filename") == AD_DEMO_FILE]


def ad_process_files(pdfs: list[dict], ad: bool) -> list[dict]:
    if not ad:
        return pdfs
    return [f for f in pdfs if f.get("filename") == AD_DEMO_FILE]
