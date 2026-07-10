"""NexaDirect CDASH demo constants."""

from __future__ import annotations

import os
from pathlib import Path

BUILD_VERSION = "2026.06.28-nexadirect-b"
# Avoid 5060/5061 — Chrome/Edge block them (ERR_UNSAFE_PORT, SIP ports)
CONSOLE_PORT = 5070
RAVE_PORT = 5071

STUDY_ID = "20260428"
STUDY_NAME = "A Phase 2 Study of Rhevexin in Rheumatoid Arthritis (RHV-RA-02)"
SITE_ID = "001"
SITE_NAME = "Northgate Hospital"
DEFAULT_VISIT = "Screening"
VISITS = ["Screening"]

# Demo study list (active study first; others shown as unavailable)
DEMO_STUDIES = [
    {
        "id": "20260428",
        "label": "20260428 — A Phase 2 Study of Rhevexin in Rheumatoid Arthritis (RHV-RA-02)",
    },
    {
        "id": "20250012",
        "label": "NovaPharm 20250012 — A Phase 1 Study of Nexavorin (NVA-PH1)",
        "disabled": True,
    },
    {
        "id": "45087-001",
        "label": "Crestova Therapeutics CRX-45087-001",
        "disabled": True,
    },
    {
        "id": "568088-008",
        "label": "Crestova Therapeutics CRX-568088-008",
        "disabled": True,
    },
]


def study_by_id(study_id: str) -> dict | None:
    for s in DEMO_STUDIES:
        if s["id"] == study_id:
            return s
    return None


def is_study_active(study_id: str) -> bool:
    try:
        from shared.study_config import bootstrap_if_needed, is_study_active as _cfg_active

        bootstrap_if_needed()
        return _cfg_active(study_id)
    except KeyError:
        s = study_by_id(study_id)
        return s is not None and not s.get("disabled")

ROOT = Path(__file__).resolve().parents[1]
_LOCAL_ASSETS = Path(r"C:\Users\zeias\OneDrive\Documents\NexaDirect Demo")
if os.environ.get("NEXA_ASSETS_DIR"):
    NEXA_ASSETS = Path(os.environ["NEXA_ASSETS_DIR"])
elif _LOCAL_ASSETS.is_dir():
    NEXA_ASSETS = _LOCAL_ASSETS
else:
    NEXA_ASSETS = ROOT / "demo_data" / "nexa_assets"
INBOX_PATH = NEXA_ASSETS / "Scanner Inbox"
# Shown in the console UI only — actual files still read from INBOX_PATH
DISPLAY_INBOX_PATH = r"C:\ClinicalData\Demo\Studies\20260428\Scanner Inbox"
FILLED_SAMPLES_PATH = NEXA_ASSETS / "Filled Samples" / "filled"
BLANK_PDF_PATH = NEXA_ASSETS / "Scannable PDFs"

SUBJECTS = [
    {"subject_id": "0101", "handwriting_style": "neat", "label": "Subject A — clean handwriting"},
    {"subject_id": "0102", "handwriting_style": "messy", "label": "Subject B — messy handwriting"},
    {"subject_id": "0103", "handwriting_style": "partial", "label": "Subject C — partial / ambiguous"},
]
ALL_SUBJECTS = [s["subject_id"] for s in SUBJECTS]

# form_code -> (display title, file suffix for PDFs, excel relative path under NEXA_ASSETS)
FORMS = {
    "DM": {
        "title": "Demographics",
        "form_id": "DM",
        "file_code": "DM",
        "excel": NEXA_ASSETS / "Visit" / "DM Demographics.xlsx",
    },
    "VS": {
        "title": "Vital Signs",
        "form_id": "VS_HORIZONTAL",
        "file_code": "VS_HORIZONTAL",
        "excel": NEXA_ASSETS / "Visit" / "VS_HORIZONTAL Vital Signs.xlsx",
    },
    "AE": {
        "title": "Adverse Events",
        "form_id": "AE",
        "file_code": "AE",
        "excel": NEXA_ASSETS / "Visit" / "AE Adverse Events.xlsx",
    },
    "CM": {
        "title": "Concomitant Medications",
        "form_id": "CM",
        "file_code": "CM",
        "excel": NEXA_ASSETS / "Visit" / "CM Concomitant Medications.xlsx",
    },
    "MH": {
        "title": "Medical History",
        "form_id": "MH",
        "file_code": "MH",
        "excel": NEXA_ASSETS / "Visit" / "MH Medical History.xlsx",
    },
    "IE": {
        "title": "Inclusion/Exclusion Criteria",
        "form_id": "IE",
        "file_code": "IE",
        "excel": NEXA_ASSETS / "Visit" / "IE Inclusion Exclusion Criteria.xls",
    },
    "DS": {
        "title": "Disposition",
        "form_id": "DS",
        "file_code": "DS",
        "excel": NEXA_ASSETS / "Visit" / "DS Disposition.xlsx",
    },
    "LB": {
        "title": "Laboratory — Local",
        "form_id": "LB_LOCAL",
        "file_code": "LB_LOCAL",
        "excel": NEXA_ASSETS / "Visit" / "LB_LOCAL Laboratory Test Results- Local Processing.xls",
    },
}

FORM_ORDER = ["IE", "DM", "MH", "CM", "VS", "LB", "AE", "DS"]

AUTO_WRITE_THRESHOLD = 0.85
DEMO_SPEED = float(os.environ.get("NEXA_DEMO_SPEED", "0.08"))  # seconds per file during demo processing
AD_DEMO_SPEED = float(os.environ.get("NEXA_AD_DEMO_SPEED", "0.4"))
AD_DEMO_FILE = "0102_DM.pdf"
AD_DEMO_SUBJECT = "0102"
