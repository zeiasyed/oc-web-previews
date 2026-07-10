#!/usr/bin/env python3
"""Generate demo source_values.json when Google Drive CSVs are unavailable."""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.constants import ALL_SUBJECTS, TARGET_CRFS_BY_VISIT, VISITS

OUT = ROOT / "demo_data" / "source_values.json"

BASE_DATE = datetime(2026, 5, 15)


def seed(subj: str, *parts: str) -> int:
    h = hashlib.md5(f"{subj}|{'|'.join(parts)}".encode()).hexdigest()
    return int(h[:8], 16)


def fmt_date(d: datetime) -> str:
    months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
    return f"{d.day:02d} {months[d.month - 1]} {d.year}"


def visit_date(subj: str, visit: str) -> str:
    idx = VISITS.index(visit) if visit in VISITS else 0
    offset = seed(subj, "visit", visit) % 2
    d = BASE_DATE + timedelta(days=idx + offset + (int(subj) % 7))
    return fmt_date(d)


def vitals(subj: str) -> dict[str, str]:
    s = seed(subj, "vitals")
    return {
        "Collection date/time": f"2026-05-{15 + s % 10:02d}T{8 + s % 4:02d}:{s % 60:02d}:00",
        "Systolic BP (mmHg)": str(110 + s % 25),
        "Diastolic BP (mmHg)": str(65 + s % 20),
        "Pulse Rate (bpm)": str(60 + s % 35),
        "Oral Temperature (°C)": f"36.{4 + s % 5}",
        "Respiratory Rate (breaths/min)": str(14 + s % 6),
        "Was vital signs collection performed?": "Yes",
    }


def pk_lipid_pcsk9(subj: str, visit: str) -> dict[str, dict]:
    d = visit_date(subj, visit)
    t = f"{9 + seed(subj, visit) % 3}:{seed(subj, 'time') % 60:02d}"
    return {
        "Nexavorin Serum PK Collection": {
            "Date of Sample Collection": d,
            "Time of Sample Collection": t,
            "Was sample collected?": "Yes",
            "Timepoint": "48H Post dose" if visit == "Day 3" else "Scheduled",
        },
        "Complete Lipid Profile": {
            "Date of Sample Collection": d,
            "Time of Sample Collection": t,
            "Was sample collected?": "Yes",
            "Was the subject fasting?": "Yes",
        },
        "PCSK9 Serum Level": {
            "Date of Sample Collection": d,
            "Time of Sample Collection": t,
            "Was sample collected?": "Yes",
            "Was the subject fasting?": "Yes",
        },
    }


def demographics(subj: str) -> dict[str, str]:
    s = seed(subj, "demo")
    year = 1965 + s % 30
    return {
        "Date of Birth": fmt_date(datetime(year, 1 + s % 12, 1 + s % 28)),
        "Sex": "Female" if s % 2 else "Male",
        "Race": ["White", "Black or African American", "Asian"][s % 3],
        "Ethnicity": "Not Hispanic or Latino" if s % 3 else "Hispanic or Latino",
        "Height (cm)": str(155 + s % 35),
        "Weight (kg)": str(55 + s % 40),
    }


def lab_panel(subj: str, form: str) -> dict[str, str]:
    s = seed(subj, form)
    if "Chemistry" in form:
        return {
            "Collection Date": visit_date(subj, "Screening"),
            "Sodium (mmol/L)": str(136 + s % 6),
            "Potassium (mmol/L)": f"4.{s % 5}",
            "Creatinine (mg/dL)": f"0.{7 + s % 4}",
            "Glucose (mg/dL)": str(85 + s % 30),
            "ALT (U/L)": str(12 + s % 20),
            "AST (U/L)": str(15 + s % 18),
        }
    if "Hematology" in form:
        return {
            "Collection Date": visit_date(subj, "Screening"),
            "Hemoglobin (g/dL)": f"{12 + s % 4}.{s % 9}",
            "WBC (10^9/L)": f"{5 + s % 4}.{s % 9}",
            "Platelet Count (10^9/L)": str(180 + s % 80),
        }
    if "Urinalysis" in form:
        return {
            "Collection Date": visit_date(subj, "Screening"),
            "Protein": "Negative",
            "Glucose": "Negative",
            "Blood": "Negative",
        }
    return {"Collection Date": visit_date(subj, "Screening"), "Result": "Within normal limits"}


def build() -> dict:
    data: dict = {}
    for subj in ALL_SUBJECTS:
        data[subj] = {}
        for visit in VISITS:
            data[subj][visit] = {}
            for form in TARGET_CRFS_BY_VISIT.get(visit, []):
                if form == "Date of Visit":
                    data[subj][visit][form] = {"Visit Date": visit_date(subj, visit)}
                elif form == "Vital Signs" or "Vital Signs" in form:
                    data[subj][visit][form] = vitals(subj)
                elif form in (
                    "Nexavorin Serum PK Collection",
                    "Complete Lipid Profile",
                    "PCSK9 Serum Level",
                ):
                    data[subj][visit][form] = pk_lipid_pcsk9(subj, visit)[form]
                elif form == "Demographics":
                    data[subj][visit][form] = demographics(subj)
                elif form == "Randomization":
                    data[subj][visit][form] = {
                        "Was the subject randomized?": "Yes",
                        "Randomization Number": str(1000 + int(subj)),
                    }
                elif form == "Study assignment":
                    data[subj][visit][form] = {
                        "Treatment Group": "Group 1" if subj in [
                            s for s in ALL_SUBJECTS if int(s) < 200 or subj.startswith("03")
                        ][:22] else "Group 2",
                    }
                elif any(x in form for x in ("Chemistry", "Hematology", "Urinalysis", "Serology", "Drug Screen", "eGFR", "FSH", "Thyroid", "Lipid", "ECG", "Pregnancy", "Inclusion", "Medical", "Physical", "Consent", "Anti-Nexavorin", "Administration", "Alcohol", "Reproductive", "Disposition")):
                    if "Chemistry" in form or "Hematology" in form or "Urinalysis" in form:
                        data[subj][visit][form] = lab_panel(subj, form)
                    elif "Consent" in form:
                        data[subj][visit][form] = {
                            "Informed Consent Date": visit_date(subj, visit),
                            "Was informed consent obtained?": "Yes",
                        }
                    elif "Inclusion" in form:
                        data[subj][visit][form] = {
                            "Does the subject meet all inclusion criteria?": "Yes",
                            "Does the subject meet any exclusion criteria?": "No",
                        }
                    else:
                        data[subj][visit][form] = {
                            "Assessment Date": visit_date(subj, visit),
                            "Result": "Normal / Not clinically significant",
                        }
    return data


def main() -> None:
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
    total = sum(len(f) for v in data.values() for f in v.values() for _ in f.values())
    print(f"Generated fallback dataset -> {OUT} ({len(ALL_SUBJECTS)} subjects, {total} field slots)")


if __name__ == "__main__":
    main()
