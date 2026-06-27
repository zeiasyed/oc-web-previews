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

    def is_running(self) -> bool:
        with self.lock:
            return self.running

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

        m = re.match(r"\s*Subject\s+(\d{3,4})\b(.*)$", s)
        if m and ("Rave ID" in s or s.endswith("...")):
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

        si = self.progress.get("step_index")
        st = self.progress.get("step_total")
        if si and st:
            base = ((si - 1) / st) * 100
            slice_pct = (1 / st) * 100
            subj_i = self.progress.get("subject_index")
            subj_t = self.progress.get("subject_total")
            within = (subj_i / subj_t) if subj_i is not None and subj_t else 0.0
            self.progress["overall_pct"] = round(min(base + slice_pct * within, 99), 1)

    def reset_for_run(self) -> None:
        with self.lock:
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
            }
            self.summary = {}

    def finish(self, exit_code: int = 0) -> None:
        with self.lock:
            self.running = False
            self.finished_at = time.time()
            self.exit_code = exit_code
            self.progress["overall_pct"] = 100
            self.progress["stage"] = "Complete"


JOB = JobState()


def new_session_token() -> str:
    return uuid.uuid4().hex[:16]
