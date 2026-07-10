"""SSE job state for sync simulation (adapted from amgen_launcher)."""

from __future__ import annotations

import json
import queue
import re
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
            "current_subject": None,
            "subject_index": None,
            "subject_total": None,
            "step_index": None,
            "step_total": None,
            "overall_pct": None,
            "stage": None,
        }
        self.last_session_token: str | None = None
        self.last_subjects: list[str] = []
        self.last_visit: str | None = None
        self.summary: dict[str, Any] = {}
        self.run_id = 0

    def is_running(self) -> bool:
        with self.lock:
            return self.running

    def set_progress(self, pct: float, stage: str | None = None) -> None:
        """Set overall progress; never decreases."""
        with self.lock:
            cap = 100.0 if float(pct) >= 100 else 99.0
            clamped = round(min(max(float(pct), 0.0), cap), 1)
            prev = self.progress.get("overall_pct") or 0.0
            self.progress["overall_pct"] = max(prev, clamped)
            if stage:
                self.progress["stage"] = stage

    def mark_complete(self, exit_code: int = 0) -> None:
        """Finalize job and force progress to 100% for clients."""
        with self.lock:
            self.running = False
            self.finished_at = time.time()
            self.exit_code = exit_code
        self.set_progress(100, "EDC updated")

    def add_line(self, line: str) -> None:
        with self.lock:
            self.log_lines.append(line)
            if len(self.log_lines) > 5000:
                self.log_lines = self.log_lines[-5000:]
            self._parse_progress(line)
            dead = []
            for q in self.subscribers:
                try:
                    q.put_nowait(line)
                except Exception:
                    dead.append(q)
            for q in dead:
                self.subscribers.remove(q)

    def _parse_progress(self, line: str) -> None:
        s = line.strip()
        m = re.match(r"\s*\[(\d+)/(\d+)\]\s*(.+)", s)
        if m:
            self.progress["stage"] = m.group(3).rstrip(".")
            self.progress["step_index"] = int(m.group(1))
            self.progress["step_total"] = int(m.group(2))

        m = re.match(r"\s*Processing\s+(\d+)\s+subject", s)
        if m:
            self.progress["subject_total"] = int(m.group(1))
            self.progress["subject_index"] = 0
            self.progress["_max_subject_index"] = 0

        m = re.match(r"\s*Subject\s+(\d{3,4})\b(.*)$", s)
        if m and ("EDC ID" in s or s.endswith("...")):
            self.progress["current_subject"] = m.group(1)
            if self.progress["subject_total"] is not None:
                if self.progress["subject_index"] is None:
                    self.progress["subject_index"] = 0
                if self.progress.get("_last_counted") != m.group(1):
                    self.progress["subject_index"] = min(
                        self.progress["subject_index"] + 1,
                        self.progress["subject_total"],
                    )
                    self.progress["_last_counted"] = m.group(1)
                self.progress["_max_subject_index"] = max(
                    self.progress.get("_max_subject_index") or 0,
                    self.progress["subject_index"] or 0,
                )

        # overall_pct is driven by sync_simulator.set_progress() — log parsing only
        # updates stage/subject metadata so the bar never jumps backward.

    def reset_for_run(self) -> int:
        with self.lock:
            self.run_id += 1
            run_id = self.run_id
            self.running = True
            self.started_at = time.time()
            self.finished_at = None
            self.exit_code = None
            self.log_lines = []
            self.progress = {
                "current_subject": None,
                "subject_index": None,
                "subject_total": None,
                "step_index": None,
                "step_total": None,
                "overall_pct": None,
                "stage": None,
                "_max_subject_index": 0,
            }
            self.summary = {}
            return run_id

    def is_active(self, run_id: int) -> bool:
        with self.lock:
            return run_id == self.run_id

    def _drain_subscribers(self) -> None:
        for q in self.subscribers:
            try:
                while True:
                    q.get_nowait()
            except queue.Empty:
                pass

    def cancel_all(self) -> None:
        self.reset_demo()

    def reset_demo(self) -> None:
        """Return console to idle demo state (EDC reset handled separately)."""
        with self.lock:
            self.run_id += 1
            self.running = False
            self.started_at = None
            self.finished_at = None
            self.exit_code = None
            self.log_lines = []
            self.progress = {
                "current_subject": None,
                "subject_index": None,
                "subject_total": None,
                "step_index": None,
                "step_total": None,
                "overall_pct": None,
                "stage": None,
            }
            self.summary = {}
            self.last_session_token = None
            self.last_subjects = []
            self.last_visit = None
            self._drain_subscribers()

    def finish(self, exit_code: int = 0) -> None:
        self.mark_complete(exit_code)


JOB = JobState()


def new_session_token() -> str:
    return uuid.uuid4().hex[:16]
