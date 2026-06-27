"""Simulated ClinSpark → EDC sync for demo."""

from __future__ import annotations

import json
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
from shared.edc_store import write_fields
from shared.job_state import JOB, new_session_token

SOURCE_PATH = ROOT / "demo_data" / "source_values.json"
DEMO_SPEED = 0.15  # seconds per form (lower = faster demo)


def load_source_values() -> dict:
    if not SOURCE_PATH.exists():
        return {}
    with SOURCE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def run_sync(visit: str, subjects: list[str], study_id: str = "20250012") -> None:
    source = load_source_values()
    forms = TARGET_CRFS_BY_VISIT.get(visit, [])
    token = new_session_token()
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    entered = skipped = conflicts = 0

    JOB.reset_for_run()
    JOB.last_session_token = token
    JOB.last_subjects = subjects
    JOB.last_visit = visit

    try:
        JOB.add_line("[1/5] Connecting to ClinSpark export...")
        time.sleep(0.4)
        JOB.add_line(f"  Study: {study_id}")
        JOB.add_line("[2/5] Loading source data for visit: " + visit)
        time.sleep(0.3)
        JOB.add_line(f"  Found {len(forms)} forms · {len(subjects)} subject(s)")
        time.sleep(0.2)
        JOB.add_line("[3/5] Mapping fields to EDC metadata...")
        time.sleep(0.3)
        JOB.add_line(f"[4/5] Writing to Medidata Rave ({visit})...")
        JOB.add_line(f"  Processing {len(subjects)} subject(s)...")

        for idx, subj in enumerate(subjects, 1):
            rave_id = 23000 + int(subj)
            JOB.add_line(f"  Subject {subj} (Rave ID: {rave_id})...")
            subj_data = source.get(subj, {}).get(visit, {})

            for form in forms:
                time.sleep(DEMO_SPEED * random.uniform(0.6, 1.2))
                fields = subj_data.get(form, {})
                if not fields:
                    JOB.add_line(f"    ⏭ {form} | (no source data for this visit)")
                    skipped += 1
                    continue

                n = write_fields(subj, visit, form, fields, ts)
                for field, val in fields.items():
                    if random.random() < 0.02:
                        JOB.add_line(
                            f"    ⚠️ {form} | {field}: Conflict — EDC has different value"
                        )
                        conflicts += 1
                    else:
                        JOB.add_line(f"    ✅ {form} | {field}: Entered ({val})")
                        entered += 1
                if n == 0:
                    skipped += 1

        JOB.add_line("[5/5] Generating sync report...")
        time.sleep(0.3)
        JOB.add_line(
            f"  Done — {entered} fields entered · {skipped} skipped · {conflicts} conflicts"
        )
        JOB.add_line(f"[SESSION] EDC verification token: {token}")
        JOB.summary = {
            "entered": entered,
            "skipped": skipped,
            "conflicts": conflicts,
            "subjects": len(subjects),
            "visit": visit,
            "token": token,
        }
        JOB.finish(0)
    except Exception as exc:
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
