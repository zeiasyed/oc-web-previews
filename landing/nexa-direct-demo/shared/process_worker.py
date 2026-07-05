"""Process Scanner Inbox PDFs through simulated extract → validate → sync/review."""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any

from shared.constants import DEMO_SPEED, STUDY_ID
from shared.extract_simulator import extract_from_filename
from shared.inbox_watcher import INBOX, clear_stale_processing, list_inbox, scan_inbox, set_file_status
from shared.job_state import JOB, new_session_token
from shared.review_store import REVIEW
from shared.study_config import (
    active_study_id,
    auto_write_threshold,
    enabled_forms,
    inbox_path,
    is_study_active,
    load_study_schema,
)
from shared.sync_worker import sync_fields
from shared.validation import cross_validate, validate_extraction

ROOT = Path(__file__).resolve().parents[1]


def _log(msg: str) -> None:
    JOB.add_line(msg)


def _process_file(item: dict[str, Any], run_id: int, study_id: str, threshold: float) -> tuple[int, int]:
    filename = item["filename"]
    form_code = item["form_code"]
    subject_id = item["subject_id"]

    set_file_status(filename, "processing")
    _log(f"  Extracting {filename}…")

    try:
        result = extract_from_filename(filename)
    except ValueError as e:
        _log(f"  SKIP {filename}: {e}")
        set_file_status(filename, "flagged")
        return 0, 1

    schema = load_study_schema(study_id, form_code) or {"fields": []}
    fields = result["fields"]
    val_issues = validate_extraction(fields, schema)
    cross = cross_validate(fields)
    for k, v in cross.items():
        val_issues.setdefault(k, []).extend(v)

    auto: dict[str, str] = {}
    flagged = 0
    auto_count = 0

    for name, meta in fields.items():
        value = str(meta.get("value") or "")
        conf = float(meta.get("confidence", 0))
        issues = val_issues.get(name, [])

        if conf >= threshold and not issues and value.strip():
            auto[name] = value
            auto_count += 1
        elif not value.strip() and not any("missing" in i for i in issues):
            continue
        else:
            issue = issues[0] if issues else ("low_confidence" if conf < threshold else "validation_failed")
            fdef = next((f for f in schema.get("fields", []) if f["name"] == name), {})
            REVIEW.add(
                filename=filename,
                subject_id=subject_id,
                form_code=form_code,
                field_name=name,
                field_label=fdef.get("label", name),
                extracted_value=value,
                confidence=conf,
                issue=issue,
            )
            flagged += 1

    if auto:
        n = sync_fields(subject_id, form_code, auto, study_id=study_id)
        _log(f"  Auto-wrote {n} field(s) for {subject_id} / {form_code}")

    status = "flagged" if flagged else "done"
    set_file_status(filename, status, auto=auto_count, flagged=flagged)
    _log(f"  {filename}: {auto_count} auto, {flagged} flagged")
    return auto_count, flagged


def _finalize_inbox_after_process() -> None:
    """Clear stale 'processing' rows left by inbox rescan racing the worker thread."""
    with INBOX.lock:
        for f in INBOX.files.values():
            if f.status == "processing":
                f.status = "done"


def _run_process(run_id: int, study_id: str) -> None:
    folder = inbox_path(study_id)
    threshold = auto_write_threshold(study_id)
    scan_inbox(folder, study_id=study_id)
    files = list_inbox(study_id)
    enabled = set(enabled_forms(study_id).keys())
    pdfs = [f for f in files if f.get("form_code") in enabled]

    total = len(pdfs)
    _log(f"Processing {total} PDF(s) from Scanner Inbox")
    _log(f"  Study: {study_id} · auto-write threshold: {threshold:.0%}")
    JOB.progress["file_total"] = total

    total_auto = 0
    total_flagged = 0

    for i, item in enumerate(pdfs, start=1):
        if not JOB.is_running() or run_id != JOB.run_id:
            _log("Processing cancelled.")
            return
        JOB.progress["file_index"] = i
        pct = (i - 1) / max(total, 1) * 100
        JOB.set_progress(pct, f"Processing {item['filename']}")
        a, f = _process_file(item, run_id, study_id, threshold)
        total_auto += a
        total_flagged += f
        time.sleep(DEMO_SPEED)

    JOB.last_session_token = new_session_token()
    JOB.last_study = study_id
    JOB.summary = {
        "study": study_id,
        "files_processed": total,
        "auto_fields": total_auto,
        "flagged_fields": total_flagged,
        "pending_review": len(REVIEW.list_pending()),
    }
    _log("")
    _log(f"Complete: {total} files, {total_auto} auto-written, {total_flagged} flagged for review.")
    if total_flagged:
        _log("Resolve flagged fields in the Review queue, then data syncs on Approve.")
    else:
        _log("Open Mock EDC to verify synced CDASH data.")
    clear_stale_processing()
    JOB.finish(0)


def launch_process(study_id: str = STUDY_ID) -> tuple[bool, str | None]:
    if JOB.is_running():
        return False, "Processing already running"
    if not is_study_active(study_id):
        return False, "Selected study is not available in this demo"
    REVIEW.clear()
    with INBOX.lock:
        INBOX.reset_statuses()
    run_id = JOB.reset_for_run()
    JOB.last_study = study_id
    _log("NexaDirect — Write to EDC started")
    threading.Thread(target=_run_process, args=(run_id, study_id), daemon=True).start()
    return True, None


def approve_review(item_id: str, corrected_value: str | None = None) -> tuple[bool, str | None]:
    item = REVIEW.approve(item_id, corrected_value)
    if not item:
        return False, "Review item not found or already approved"
    sync_fields(
        item.subject_id,
        item.form_code,
        {item.field_name: item.extracted_value},
        study_id=active_study_id(),
    )
    _log(f"Approved {item.field_name} for {item.subject_id} / {item.form_code} → EDC")
    return True, None
