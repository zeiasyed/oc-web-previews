#!/usr/bin/env python3
"""Build source_values.json from local ClinSpark CSV exports."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.constants import ALL_SUBJECTS, TARGET_CRFS_BY_VISIT, VISITS
from shared.drive_utils import parse_csv_file
from shared.mapping_engine import (
    extract_subject_id,
    infer_forms_from_filename,
    norm_visit,
    row_to_fields,
)

RAW = ROOT / "demo_data" / "raw_csv"
OUT = ROOT / "demo_data" / "source_values.json"


def ensure_nested(data: dict, *keys: str) -> dict:
    cur = data
    for k in keys:
        cur = cur.setdefault(k, {})
    return cur


def main() -> None:
    if not RAW.exists():
        print("No raw_csv folder. Run scripts/fetch_assets.py first.")
        sys.exit(1)

    data: dict = {s: {} for s in ALL_SUBJECTS}
    files = sorted(RAW.glob("*.csv"))
    print(f"Processing {len(files)} CSV files...")

    for path in files:
        forms_hint = infer_forms_from_filename(path.name)
        if not forms_hint:
            continue
        try:
            rows = parse_csv_file(path)
        except Exception as exc:
            print(f"  skip {path.name}: {exc}")
            continue

        for row in rows:
            subj = extract_subject_id(row.get("Subject", ""))
            if not subj or subj not in data:
                continue
            visit = norm_visit(row.get("Study Event", ""))
            if visit not in VISITS:
                continue
            fields = row_to_fields(row)
            if not fields:
                continue

            visit_forms = set(TARGET_CRFS_BY_VISIT.get(visit, []))
            for form in forms_hint:
                if form not in visit_forms and form not in (
                    "Prior and Concomitant Medications Summary",
                    "Prior and Concomitant Medications",
                    "Adverse Events Summary",
                ):
                    continue
                bucket = ensure_nested(data, subj, visit, form)
                bucket.update(fields)

    # Visit date fallback from collection time in visit status rows
    for subj in ALL_SUBJECTS:
        for visit in VISITS:
            dov = data[subj].get(visit, {}).get("Date of Visit", {})
            if dov:
                continue
            for form_fields in data[subj].get(visit, {}).values():
                for k, v in form_fields.items():
                    if "collection" in k.lower() and "date" in k.lower() and v:
                        ensure_nested(data, subj, visit, "Date of Visit")["Visit Date"] = v
                        break

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    total = sum(
        len(fields)
        for subj in data.values()
        for visit in subj.values()
        for fields in visit.values()
    )
    print(f"Wrote {OUT} — {total} field values across {len(ALL_SUBJECTS)} subjects")


if __name__ == "__main__":
    main()
