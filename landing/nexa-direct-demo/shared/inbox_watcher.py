"""Poll Scanner Inbox for PDF files."""

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from shared.study_config import active_study_id, display_inbox_path, enabled_forms, inbox_path

InboxStatus = Literal["new", "processing", "done", "flagged"]

_FILENAME_RE = re.compile(r"^(\d{4})_([A-Z0-9_]+)\.pdf$", re.I)


@dataclass
class InboxFile:
    filename: str
    path: str
    subject_id: str
    form_code: str | None
    form_title: str | None
    status: InboxStatus = "new"
    auto_fields: int = 0
    flagged_fields: int = 0


@dataclass
class InboxState:
    lock: threading.Lock = field(default_factory=threading.Lock)
    files: dict[str, InboxFile] = field(default_factory=dict)
    last_scan: float = 0.0

    def reset_statuses(self) -> None:
        """Reset file statuses. Caller must hold ``INBOX.lock`` if concurrent access is possible."""
        for f in self.files.values():
            f.status = "new"
            f.auto_fields = 0
            f.flagged_fields = 0


INBOX = InboxState()


def _form_code_from_suffix(suffix: str, study_id: str | None = None) -> str | None:
    suffix = suffix.upper()
    for code, meta in enabled_forms(study_id).items():
        if str(meta.get("file_code", code)).upper() == suffix:
            return code
    return None


def parse_filename(name: str, study_id: str | None = None) -> tuple[str, str] | None:
    m = _FILENAME_RE.match(name)
    if not m:
        return None
    subject_id, suffix = m.group(1), m.group(2)
    form_code = _form_code_from_suffix(suffix, study_id)
    if not form_code:
        return None
    return subject_id, form_code


def scan_inbox(inbox: Path | None = None, study_id: str | None = None) -> list[InboxFile]:
    sid = study_id or active_study_id()
    folder = inbox or inbox_path(sid)
    forms = enabled_forms(sid)
    found: dict[str, InboxFile] = {}
    if folder.exists():
        for p in sorted(folder.glob("*.pdf")):
            parsed = parse_filename(p.name, sid)
            if not parsed:
                continue
            subject_id, form_code = parsed
            if form_code not in forms:
                continue
            meta = forms[form_code]
            found[p.name] = InboxFile(
                filename=p.name,
                path=str(p),
                subject_id=subject_id,
                form_code=form_code,
                form_title=meta.get("title", form_code),
                status="new",
                auto_fields=0,
                flagged_fields=0,
            )
    with INBOX.lock:
        for nf in found.values():
            prev = INBOX.files.get(nf.filename)
            if prev:
                nf.status = prev.status
                nf.auto_fields = prev.auto_fields
                nf.flagged_fields = prev.flagged_fields
        INBOX.files = found
        INBOX.last_scan = time.time()
        return list(found.values())


def clear_stale_processing() -> None:
    """Mark any leftover processing rows after a batch completes."""
    with INBOX.lock:
        for f in INBOX.files.values():
            if f.status != "processing":
                continue
            f.status = "flagged" if f.flagged_fields else "done"


def set_file_status(filename: str, status: InboxStatus, auto: int = 0, flagged: int = 0) -> None:
    with INBOX.lock:
        f = INBOX.files.get(filename)
        if f:
            f.status = status
            f.auto_fields = auto
            f.flagged_fields = flagged


def list_inbox(study_id: str | None = None) -> list[dict]:
    sid = study_id or active_study_id()
    scan_inbox(study_id=sid)
    with INBOX.lock:
        return [
            {
                "filename": f.filename,
                "path": f.path,
                "subject_id": f.subject_id,
                "form_code": f.form_code,
                "form_title": f.form_title,
                "status": f.status,
                "auto_fields": f.auto_fields,
                "flagged_fields": f.flagged_fields,
            }
            for f in sorted(INBOX.files.values(), key=lambda x: (x.subject_id, x.form_code or ""))
        ]


def inbox_display_path(study_id: str | None = None) -> str:
    return display_inbox_path(study_id or active_study_id())
