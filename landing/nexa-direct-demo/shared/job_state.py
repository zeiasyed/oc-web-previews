"""SSE job state for NexaDirect processing."""

from __future__ import annotations

import queue
import threading
import time
import uuid
from typing import Any


class JobState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.running = False
        self.started_at: float | None = None
        self.finished_at: float | None = None
        self.exit_code: int | None = None
        self.log_lines: list[str] = []
        self.subscribers: list[queue.Queue] = []
        self.progress: dict[str, Any] = {
            "overall_pct": None,
            "stage": None,
            "file_index": None,
            "file_total": None,
        }
        self.last_session_token: str | None = None
        self.last_study: str | None = None
        self.summary: dict[str, Any] = {}
        self.run_id = 0

    def is_running(self) -> bool:
        with self.lock:
            return self.running

    def set_progress(self, pct: float, stage: str | None = None) -> None:
        with self.lock:
            cap = 100.0 if float(pct) >= 100 else 99.0
            clamped = round(min(max(float(pct), 0.0), cap), 1)
            prev = self.progress.get("overall_pct") or 0.0
            self.progress["overall_pct"] = max(prev, clamped)
            if stage:
                self.progress["stage"] = stage

    def mark_complete(self, exit_code: int = 0) -> None:
        with self.lock:
            self.running = False
            self.finished_at = time.time()
            self.exit_code = exit_code
        self.set_progress(100, "Complete")

    def add_line(self, line: str) -> None:
        with self.lock:
            self.log_lines.append(line)
            if len(self.log_lines) > 5000:
                self.log_lines = self.log_lines[-5000:]
            dead = []
            for q in self.subscribers:
                try:
                    q.put_nowait(line)
                except Exception:
                    dead.append(q)
            for q in dead:
                self.subscribers.remove(q)

    def reset_for_run(self) -> int:
        with self.lock:
            self.run_id += 1
            run_id = self.run_id
            self.running = True
            self.started_at = time.time()
            self.finished_at = None
            self.exit_code = None
            self.log_lines = []
            self.progress = {"overall_pct": None, "stage": None, "file_index": None, "file_total": None}
            self.summary = {}
            return run_id

    def cancel_all(self) -> None:
        with self.lock:
            self.run_id += 1
            self.running = False
            self.finished_at = time.time()
            self.log_lines = []
            self.progress = {"overall_pct": None, "stage": "Cancelled", "file_index": None, "file_total": None}
            self.summary = {}
            self.last_session_token = None
            self.last_study = None
            for q in self.subscribers:
                try:
                    while True:
                        q.get_nowait()
                except queue.Empty:
                    pass
            self.subscribers.clear()

    def finish(self, exit_code: int = 0) -> None:
        self.mark_complete(exit_code)


JOB = JobState()


def new_session_token() -> str:
    return uuid.uuid4().hex[:16]
