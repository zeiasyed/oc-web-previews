"""Simulated ClinSpark → EDC sync for demo."""

from __future__ import annotations

import hashlib
import json
import os
import random
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from shared.constants import TARGET_CRFS_BY_VISIT
from shared import audit_store
from shared.edc_store import get_field_value, write_field
from shared.job_state import JOB, new_session_token

SOURCE_PATH = ROOT / "demo_data" / "source_values.json"
DEMO_SPEED = float(os.environ.get("NEXA_DEMO_SPEED", "0.15"))  # seconds per form

# Curated conflicts keyed by (subject, visit, form, field) → fake EDC value.
# Demo scenario: subjects 0103–0303, Day 2.
DEMO_CONFLICTS: dict[tuple[str, str, str, str], str] = {
    # ── Day 2  (primary demo visit) ───────────────────────────────
    # Vital Signs mismatches
    ("0105", "Day 2", "Vital Signs", "Systolic BP (mmHg)"): "124",
    ("0109", "Day 2", "Vital Signs", "Diastolic BP (mmHg)"): "71",
    ("0113", "Day 2", "Vital Signs", "Pulse Rate (bpm)"): "82",
    ("0117", "Day 2", "Vital Signs", "Respiratory Rate (breaths/min)"): "18",
    ("0120", "Day 2", "Vital Signs", "Oral Temperature (\u00b0C)"): "36.9",
    # PK / lab timing discrepancies
    ("0106", "Day 2", "Nexavorin Serum PK Collection", "Time of Sample Collection"): "10:48",
    ("0115", "Day 2", "Nexavorin Serum PK Collection", "Time of Sample Collection"): "11:20",
    # Fasting status conflicts
    ("0110", "Day 2", "Complete Lipid Profile", "Was the subject fasting?"): "No",
    ("0303", "Day 2", "PCSK9 Serum Level", "Was the subject fasting?"): "No",
}

# Fields pre-seeded in EDC with the matching source value so they appear
# as green "already matched" checkmarks during sync.
# Demo scenario: subjects 0103–0303, Day 2.
DEMO_PREMATCHED: list[tuple[str, str, str, str]] = [
    ("0104", "Day 2", "Vital Signs", "Pulse Rate (bpm)"),
    ("0108", "Day 2", "Vital Signs", "Diastolic BP (mmHg)"),
    ("0121", "Day 2", "Vital Signs", "Systolic BP (mmHg)"),
]


def _seed_prematched(visit: str, subjects: list[str], source: dict) -> None:
    """Write matching source values into EDC for entries that should appear
    as 'already matched' during the sync."""
    subj_set = set(subjects)
    for subj, v, form, field in DEMO_PREMATCHED:
        if v != visit or subj not in subj_set:
            continue
        val = source.get(subj, {}).get(visit, {}).get(form, {}).get(field)
        if val is not None:
            write_field(
                subj, visit, form, field, str(val), "prior-entry",
                actor="NexaFlow", action="prior_entry",
            )


def _form_rng(subj: str, form: str) -> random.Random:
    """Deterministic RNG seeded by subject+form for per-form timing."""
    key = f"{subj}:{form}"
    h = hashlib.md5(key.encode()).hexdigest()
    return random.Random(int(h[:12], 16))


def load_source_values() -> dict:
    if not SOURCE_PATH.exists():
        return {}
    with SOURCE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def _cancelled(run_id: int) -> bool:
    return not JOB.is_active(run_id)


def _sleep(run_id: int, seconds: float) -> bool:
    """Sleep in short chunks. Returns True if cancelled."""
    end = time.time() + seconds
    while time.time() < end:
        if _cancelled(run_id):
            return True
        time.sleep(min(0.05, end - time.time()))
    return _cancelled(run_id)


def _abort_sync(run_id: int) -> None:
    if JOB.is_active(run_id):
        JOB.add_line("⏹ Sync cancelled.")
        JOB.finish(1)


def run_sync(visit: str, subjects: list[str], study_id: str = "20250012") -> None:
    source = load_source_values()
    _seed_prematched(visit, subjects, source)
    forms = TARGET_CRFS_BY_VISIT.get(visit, [])
    token = new_session_token()
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    entered = skipped = conflicts = matched = 0
    review_details: list[dict] = []

    run_id = JOB.reset_for_run()
    JOB.last_session_token = token
    JOB.last_subjects = subjects
    JOB.last_visit = visit
    audit_store.log_event(
        "NexaFlow",
        "sync_start",
        visit=visit,
        detail=f"{len(subjects)} subject(s) · study {study_id}",
    )

    total_work = max(len(subjects) * len(forms), 1)

    try:
        JOB.set_progress(2, "Connecting to ClinSpark export")
        JOB.add_line("[1/5] Connecting to ClinSpark export...")
        if _sleep(run_id, 0.4):
            _abort_sync(run_id)
            return
        JOB.add_line(f"  Study: {study_id}")
        JOB.set_progress(8, "Loading source data")
        JOB.add_line("[2/5] Loading source data for visit: " + visit)
        if _sleep(run_id, 0.3):
            _abort_sync(run_id)
            return
        JOB.add_line(f"  Found {len(forms)} forms · {len(subjects)} subject(s)")
        if _sleep(run_id, 0.2):
            _abort_sync(run_id)
            return
        JOB.set_progress(18, "Mapping fields to EDC metadata")
        JOB.add_line("[3/5] Mapping fields to EDC metadata...")
        if _sleep(run_id, 0.3):
            _abort_sync(run_id)
            return
        JOB.set_progress(25, f"Writing to EDC ({visit})")
        JOB.add_line(f"[4/5] Writing to EDC ({visit})...")
        JOB.add_line(f"  Processing {len(subjects)} subject(s)...")

        work_done = 0
        for subj in subjects:
            if _cancelled(run_id):
                _abort_sync(run_id)
                return
            edc_id = 23000 + int(subj)
            JOB.add_line(f"  Subject {subj} (EDC ID: {edc_id})...")
            subj_data = source.get(subj, {}).get(visit, {})

            for form in forms:
                if _cancelled(run_id):
                    _abort_sync(run_id)
                    return
                work_done += 1
                write_pct = 25 + (68 * work_done / total_work)
                JOB.set_progress(
                    write_pct,
                    f"Writing to EDC ({visit}) — Subject {subj}",
                )
                if _sleep(run_id, DEMO_SPEED * _form_rng(subj, form).uniform(0.6, 1.2)):
                    _abort_sync(run_id)
                    return
                fields = subj_data.get(form, {})
                if not fields:
                    JOB.add_line(f"    ⏭ {form} | (no source data for this visit)")
                    skipped += 1
                    continue

                for field, val in fields.items():
                    if _cancelled(run_id):
                        _abort_sync(run_id)
                        return
                    if val is None or str(val).strip() == "":
                        continue
                    source_str = str(val).strip()
                    existing = get_field_value(subj, visit, form, field)
                    entry = {
                        "subject": subj,
                        "form": form,
                        "field": field,
                        "source_value": source_str,
                        "edc_value": "",
                        "status": "entered",
                    }

                    if existing is not None:
                        edc_str = str(existing).strip()
                        entry["edc_value"] = edc_str
                        if edc_str == source_str:
                            matched += 1
                            entry["status"] = "matched"
                            review_details.append(entry)
                            JOB.add_line(
                                f"    ✓ {form} | {field}: Already in EDC — matches source ({source_str})"
                            )
                        else:
                            conflicts += 1
                            entry["status"] = "conflict"
                            review_details.append(entry)
                            audit_store.open_query(
                                subj, visit, form, field,
                                f"Flagged item — source vs EDC mismatch — reconcile before write",
                                source_value=source_str,
                                edc_value=edc_str,
                            )
                            JOB.add_line(
                                f"    ⚠️ {form} | {field}: Conflict — source {source_str}, EDC has {edc_str}"
                            )
                        continue

                    curated = DEMO_CONFLICTS.get((subj, visit, form, field))
                    if curated is not None:
                        write_field(
                            subj, visit, form, field, curated, "prior-entry",
                            actor="NexaFlow", action="prior_entry",
                        )
                        conflicts += 1
                        entry["status"] = "conflict"
                        entry["edc_value"] = curated
                        review_details.append(entry)
                        audit_store.open_query(
                            subj, visit, form, field,
                            f"Flagged item — source vs EDC mismatch — reconcile before write",
                            source_value=source_str,
                            edc_value=curated,
                        )
                        JOB.add_line(
                            f"    ⚠️ {form} | {field}: Conflict — source {source_str}, EDC has {curated}"
                        )
                        continue

                    write_field(
                        subj, visit, form, field, source_str, ts,
                        actor="NexaFlow", action="sync_enter",
                    )
                    entered += 1
                    JOB.add_line(f"    ✅ {form} | {field}: Entered ({source_str})")

        if _cancelled(run_id):
            _abort_sync(run_id)
            return

        JOB.set_progress(96, "Generating sync report")
        JOB.add_line("[5/5] Generating sync report...")
        if _sleep(run_id, 0.3):
            _abort_sync(run_id)
            return
        JOB.add_line(
            f"  Done — {entered} entered · {matched} matched · {skipped} skipped · {conflicts} flagged"
        )
        JOB.add_line(f"[SESSION] EDC verification token: {token}")
        summary = {
            "entered": entered,
            "matched": matched,
            "skipped": skipped,
            "conflicts": conflicts,
            "review_details": review_details,
            "conflict_details": [r for r in review_details if r["status"] == "conflict"],
            "subjects": len(subjects),
            "visit": visit,
            "token": token,
        }
        with JOB.lock:
            JOB.summary = summary
        audit_store.log_event(
            "NexaFlow",
            "sync_complete",
            visit=visit,
            detail=f"{entered} entered · {matched} matched · {conflicts} flagged",
        )
        if _cancelled(run_id):
            _abort_sync(run_id)
            return
        JOB.finish(0)
    except Exception as exc:
        if JOB.is_active(run_id):
            JOB.add_line(f"❌ Error: {exc}")
            JOB.finish(1)


def launch_sync(visit: str, subjects: list[str], study_id: str = "20250012") -> tuple[bool, str | None]:
    if JOB.is_running():
        return False, "A sync job is already running."
    if not visit:
        return False, "Visit is required."
    if not subjects:
        return False, "Select at least one subject."
    threading.Thread(target=run_sync, args=(visit, subjects, study_id), daemon=True).start()
    return True, None
