#!/usr/bin/env python3
"""
End-to-end verification: ClinSpark source -> sync -> SQLite -> CRF display.

Phase 1: Each visit in isolation (reset, sync all subjects, verify store + CRF).
Phase 2: Full study (all visits accumulated), accept all conflicts, verify every field.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ["NEXA_DEMO_SPEED"] = "0"

from shared.constants import ALL_SUBJECTS, TARGET_CRFS_BY_VISIT, VISITS
from shared.crf_render import build_crf_fields, crf_display_values
from shared.edc_store import get_field_value, get_form_fields, reset as reset_edc, write_field
from shared.job_state import JOB
from shared.runtime_urls import edc_public_base
from shared.sync_simulator import DEMO_CONFLICTS, load_source_values, run_sync


def build_schemas() -> None:
    from scripts.build_form_schemas import main as _build

    _build()


def accept_conflicts(visit: str, review_details: list[dict]) -> int:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    count = 0
    for row in review_details:
        if row.get("status") != "conflict":
            continue
        subj = row["subject"]
        form = row["form"]
        field = row["field"]
        value = str(row.get("source_value", "")).strip()
        if subj and form and field and value:
            write_field(subj, visit, form, field, value, ts)
            count += 1
    return count


def expected_after_sync(subj: str, visit: str, form: str, field: str, source_val: str) -> str:
    curated = DEMO_CONFLICTS.get((subj, visit, form, field))
    return str(curated) if curated is not None else source_val


def iter_source_fields(source: dict):
    for subj in ALL_SUBJECTS:
        for visit in VISITS:
            for form in TARGET_CRFS_BY_VISIT.get(visit, []):
                for field, val in (source.get(subj, {}).get(visit, {}).get(form) or {}).items():
                    if val is None or str(val).strip() == "":
                        continue
                    yield subj, visit, form, field, str(val).strip()


def verify_store_and_crf(
    source: dict,
    errors: list[str],
    *,
    expect_source: bool,
    visit_filter: str | None = None,
) -> int:
    checked = 0
    for subj, visit, form, field, source_str in iter_source_fields(source):
        if visit_filter and visit != visit_filter:
            continue
        if expect_source:
            expected = source_str
        else:
            expected = expected_after_sync(subj, visit, form, field, source_str)
        actual = get_field_value(subj, visit, form, field)
        checked += 1
        if actual != expected:
            errors.append(
                f"{subj} | {visit} | {form} | {field}: expected {expected!r}, store has {actual!r}"
            )
        display = crf_display_values(form, get_form_fields(subj, visit, form))
        shown = display.get(field, "")
        if str(shown) != str(actual or ""):
            errors.append(
                f"{subj} | {visit} | {form} | {field}: store {actual!r}, CRF shows {shown!r}"
            )
    return checked


def phase1_per_visit(source: dict, errors: list[str]) -> None:
    print("Phase 1: per-visit sync verification...")
    for visit in VISITS:
        reset_edc()
        JOB.cancel_all()
        run_sync(visit, ALL_SUBJECTS)
        n = verify_store_and_crf(source, errors, expect_source=False, visit_filter=visit)
        conflicts = len([r for r in (JOB.summary or {}).get("review_details", []) if r.get("status") == "conflict"])
        print(f"  {visit}: {n} cells OK, {conflicts} conflicts")


def phase2_full_study_resolve(source: dict, errors: list[str]) -> int:
    print("Phase 2: full study sync, accept all conflicts, verify all fields...")
    reset_edc()
    JOB.cancel_all()
    total_accepted = 0
    for visit in VISITS:
        run_sync(visit, ALL_SUBJECTS)
        review = (JOB.summary or {}).get("review_details") or []
        total_accepted += accept_conflicts(visit, review)
    checked = verify_store_and_crf(source, errors, expect_source=True)
    print(f"  Accepted {total_accepted} conflict rows; verified {checked} cells")
    return checked


def verify_edc_launch_url(errors: list[str]) -> None:
    """Hosted demo uses a separate EDC subdomain — not /edc on the console host."""
    base = edc_public_base()
    if base.startswith("http://127.0.0.1"):
        return
    if base.rstrip("/").endswith("demo-source.nexa-trials.com"):
        errors.append(f"EDC_PUBLIC_BASE must be demo-source-edc subdomain, got {base!r}")
    if "/edc" in base.replace("://", ""):
        errors.append(f"EDC_PUBLIC_BASE should not include /edc path: {base!r}")


def main() -> int:
    print("Building form schemas...")
    build_schemas()

    source = load_source_values()
    if not source:
        print("ERROR: source_values.json missing or empty")
        return 1

    errors: list[str] = []
    verify_edc_launch_url(errors)
    phase1_per_visit(source, errors)
    phase2_full_study_resolve(source, errors)

    print("\n=== SUMMARY ===")
    print(f"Subjects: {len(ALL_SUBJECTS)}")
    print(f"Visits: {len(VISITS)}")
    if errors:
        print(f"FAILURES: {len(errors)}")
        for e in errors[:40]:
            print(" ", e)
        if len(errors) > 40:
            print(f"  ... and {len(errors) - 40} more")
        return 1
    print("All automated checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
