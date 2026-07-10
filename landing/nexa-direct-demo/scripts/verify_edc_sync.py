#!/usr/bin/env python3
"""
Thorough NexaDirect verification: inbox -> extract -> process -> review -> EDC store -> CRF display.

Phase 1: Inbox + extraction payloads + schemas
Phase 2: Process inbox — verify auto-written fields in store + CRF
Phase 3: Approve all review items — verify every non-skipped field (117 total)
Phase 4: Hosted EDC launch URL configuration
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("NEXA_DEMO_SPEED", "0")

from shared.constants import (
    ALL_SUBJECTS,
    DEFAULT_VISIT,
    FORM_ORDER,
    INBOX_PATH,
    STUDY_ID,
)
from shared.crf_render import build_crf_fields, crf_display_values
from shared.cdash_schemas import load_schema
from shared.edc_store import get_field_value, get_form_fields, reset as reset_edc
from shared.extract_simulator import extract_from_filename, resolved_field_value
from shared.inbox_watcher import list_inbox, scan_inbox
from shared.job_state import JOB
from shared.process_worker import approve_review, launch_process
from shared.review_store import REVIEW
from shared.runtime_urls import edc_public_base
from shared.study_config import auto_write_threshold, bootstrap_if_needed, load_study_schema, set_active_study
from shared.validation import cross_validate, validate_extraction

SCHEMA_DIR = ROOT / "demo_data" / "schemas"
EXTRACTIONS_DIR = ROOT / "demo_data" / "simulated_extractions"


def wait_for_job(timeout: float = 120.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not JOB.is_running() and JOB.finished_at:
            return JOB.exit_code == 0
        time.sleep(0.05)
    return False


def expected_fields_after_full_approve(filename: str, study_id: str) -> dict[str, str]:
    """Mirror process_worker field routing; flagged fields resolve to scan truth (correct_value)."""
    result = extract_from_filename(filename)
    form_code = result["form_code"]
    schema = load_study_schema(study_id, form_code) or {"fields": []}
    fields = result["fields"]
    threshold = auto_write_threshold(study_id)
    val_issues = validate_extraction(fields, schema)
    cross = cross_validate(fields)
    for k, v in cross.items():
        val_issues.setdefault(k, []).extend(v)

    expected: dict[str, str] = {}
    for name, meta in fields.items():
        value = str(meta.get("value") or "")
        truth = resolved_field_value(meta)
        conf = float(meta.get("confidence", 0))
        issues = val_issues.get(name, [])

        if conf >= threshold and not issues and value.strip():
            expected[name] = truth
        elif not value.strip() and not any("missing" in i for i in issues):
            continue
        else:
            expected[name] = truth
    return expected


def verify_edc_launch_url(errors: list[str]) -> None:
    base = edc_public_base()
    if base.startswith("http://127.0.0.1"):
        return
    if base.rstrip("/").endswith("demo-direct.nexa-trials.com"):
        errors.append(f"EDC_PUBLIC_BASE must be demo-edc subdomain, got {base!r}")
    if "/edc" in base.replace("://", ""):
        errors.append(f"EDC_PUBLIC_BASE should not include /edc path: {base!r}")


def phase1_assets(errors: list[str]) -> list[dict]:
    print("Phase 1: inbox, extractions, schemas...")
    bootstrap_if_needed()
    set_active_study(STUDY_ID)

    scan_inbox(INBOX_PATH, study_id=STUDY_ID)
    files = list_inbox(STUDY_ID)
    if len(files) != 24:
        errors.append(f"Expected 24 inbox PDFs, found {len(files)}")

    for subj in ALL_SUBJECTS:
        for form in FORM_ORDER:
            path = EXTRACTIONS_DIR / f"{subj}_{form}.json"
            if not path.exists():
                errors.append(f"Missing extraction payload: {path.name}")
            if not load_schema(form, SCHEMA_DIR):
                errors.append(f"Missing CDASH schema: {form}.json")

    for item in files:
        parsed_ok = item.get("form_code") in FORM_ORDER and item.get("subject_id") in ALL_SUBJECTS
        if not parsed_ok:
            errors.append(f"Inbox file not mapped: {item.get('filename')}")

    print(f"  {len(files)} inbox PDFs, {len(ALL_SUBJECTS)} subjects, {len(FORM_ORDER)} forms")
    return files


def verify_fields_in_store_and_crf(
    subject: str,
    form: str,
    expected: dict[str, str],
    errors: list[str],
    *,
    phase: str,
) -> int:
    checked = 0
    values = get_form_fields(subject, DEFAULT_VISIT, form)
    display = crf_display_values(form, values, SCHEMA_DIR)
    for field, exp in expected.items():
        checked += 1
        actual = get_field_value(subject, DEFAULT_VISIT, form, field)
        if actual != exp:
            errors.append(
                f"[{phase}] {subject}/{form}/{field}: expected {exp!r}, store has {actual!r}"
            )
        shown = display.get(field, "")
        if str(shown) != str(actual or ""):
            errors.append(
                f"[{phase} crf] {subject}/{form}/{field}: store {actual!r}, CRF shows {shown!r}"
            )
    # CRF rows with synced values must match store
    for row in build_crf_fields(form, values, SCHEMA_DIR):
        if row["synced"] and row["name"] in expected:
            if str(row["value"]) != expected[row["name"]]:
                errors.append(
                    f"[{phase} crf-row] {subject}/{form}/{row['name']}: "
                    f"row {row['value']!r} != expected {expected[row['name']]!r}"
                )
    return checked


def phase2_process(files: list[dict], errors: list[str]) -> dict[str, dict[str, str]]:
    print("Phase 2: process inbox, verify auto-written fields...")
    reset_edc()
    REVIEW.clear()
    JOB.cancel_all()

    ok, err = launch_process(STUDY_ID)
    if not ok:
        errors.append(f"Could not start process: {err}")
        return {}

    if not wait_for_job():
        errors.append("Processing did not complete in time")
        return {}

    summary = JOB.summary or {}
    auto_count = int(summary.get("auto_fields", 0))
    flagged_count = int(summary.get("flagged_fields", 0))
    if auto_count != 78:
        errors.append(f"Expected 78 auto-written fields, got {auto_count}")
    if flagged_count != 39:
        errors.append(f"Expected 39 flagged fields, got {flagged_count}")

    all_expected: dict[str, dict[str, str]] = {}
    auto_only: dict[str, dict[str, str]] = {}
    threshold = auto_write_threshold(STUDY_ID)

    checked = 0
    for item in files:
        filename = item["filename"]
        full = expected_fields_after_full_approve(filename, STUDY_ID)
        all_expected[filename] = full

        result = extract_from_filename(filename)
        form_code = result["form_code"]
        subject = result["subject_id"]
        schema = load_study_schema(STUDY_ID, form_code) or {"fields": []}
        val_issues = validate_extraction(result["fields"], schema)
        cross = cross_validate(result["fields"])
        for k, v in cross.items():
            val_issues.setdefault(k, []).extend(v)

        auto_fields: dict[str, str] = {}
        for name, meta in result["fields"].items():
            value = str(meta.get("value") or "")
            conf = float(meta.get("confidence", 0))
            issues = val_issues.get(name, [])
            if conf >= threshold and not issues and value.strip():
                auto_fields[name] = value

        auto_only[filename] = auto_fields
        checked += verify_fields_in_store_and_crf(
            subject, form_code, auto_fields, errors, phase="auto"
        )

    print(f"  auto-written: {auto_count} fields, verified {checked} cells")
    pending = REVIEW.list_pending()
    if len(pending) != 39:
        errors.append(f"Expected 39 pending review items, got {len(pending)}")
    return all_expected


def phase3_approve_all(all_expected: dict[str, dict[str, str]], errors: list[str]) -> None:
    print("Phase 3: approve all review items, verify full EDC + CRF...")
    pending = list(REVIEW.list_pending())
    for item in pending:
        result = extract_from_filename(item["filename"])
        meta = result["fields"].get(item["field_name"], {})
        truth = resolved_field_value(meta)
        ok, err = approve_review(item["id"], truth)
        if not ok:
            errors.append(f"Approve failed for {item['id']}: {err}")

    if REVIEW.list_pending():
        errors.append(f"Review queue not empty: {len(REVIEW.list_pending())} remaining")

    total_checked = 0
    for filename, expected in all_expected.items():
        result = extract_from_filename(filename)
        total_checked += verify_fields_in_store_and_crf(
            result["subject_id"],
            result["form_code"],
            expected,
            errors,
            phase="final",
        )

    from shared.edc_store import count_all

    total = count_all()
    if total != 117:
        errors.append(f"Expected 117 fields in EDC store, got {total}")

    print(f"  verified {total_checked} field cells across all subjects/forms")


def main() -> int:
    print("NexaDirect thorough verification")
    print("=" * 40)

    errors: list[str] = []
    verify_edc_launch_url(errors)
    files = phase1_assets(errors)
    if errors:
        _report(errors)
        return 1

    all_expected = phase2_process(files, errors)
    if errors:
        _report(errors)
        return 1

    phase3_approve_all(all_expected, errors)
    _report(errors)
    return 1 if errors else 0


def _report(errors: list[str]) -> None:
    print("\n=== SUMMARY ===")
    if errors:
        print(f"FAILURES: {len(errors)}")
        for e in errors[:40]:
            print(" ", e)
        if len(errors) > 40:
            print(f"  ... and {len(errors) - 40} more")
    else:
        print("All automated checks passed.")
        print("  24 inbox PDFs processed")
        print("  78 auto-written + 39 review-approved = 117 EDC fields")
        print("  3 subjects x 8 forms — store and CRF display verified")


if __name__ == "__main__":
    raise SystemExit(main())
