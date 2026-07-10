"""Generate simulated extraction JSON payloads for demo subjects."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.constants import ALL_SUBJECTS, FORMS

OUT = ROOT / "demo_data" / "simulated_extractions"

# Per-form demo values using actual CDASH field IDs from OpenClinica schemas
FORM_VALUES: dict[str, dict[str, dict[str, str]]] = {
    "DM": {
        "0101": {
            "DM_BRTHDAT": "1970-01-15",
            "DM_AGE": "56",
            "DM_AGEU": "YEARS",
            "DM_SEX": "F",
            "DM_ETHNIC": "NOT  HISPANIC  OR  LATINO",
            "DM_RACE": "WHITE",
        },
        "0102": {
            "DM_BRTHDAT": "1975-06-30",
            "DM_AGE": "50",
            "DM_AGEU": "YEARS",
            "DM_SEX": "M",
            "DM_ETHNIC": "HISPANIC  OR  LATINO",
            "DM_RACE": "ASIAN",
        },
        "0103": {
            "DM_BRTHDAT": "1980-12-25",
            "DM_AGE": "",
            "DM_AGEU": "YEARS",
            "DM_SEX": "F",
            "DM_ETHNIC": "",
            "DM_RACE": "BLACK_OR_AFRICAN_AMERICAN",
        },
    },
    "VS": {
        "0101": {
            "VS_HORIZONTAL_VSPERF": "Y",
            "VS_HORIZONTAL_VSDAT": "2026-06-10",
            "VS_HORIZONTAL_SYSBP_VSORRES": "118",
            "VS_HORIZONTAL_SYSBP_VSORRESU": "mmHg",
            "VS_HORIZONTAL_DIABP_VSORRES": "76",
            "VS_HORIZONTAL_DIABP_VSORRESU": "mmHg",
            "VS_HORIZONTAL_PULSE_VSORRES": "72",
            "VS_HORIZONTAL_PULSE_VSORRESU": "beats/min",
            "VS_HORIZONTAL_TEMP_VSORRES": "36.6",
            "VS_HORIZONTAL_TEMP_VSORRESU": "C",
        },
        "0102": {
            "VS_HORIZONTAL_VSPERF": "Y",
            "VS_HORIZONTAL_VSDAT": "2026-06-11",
            "VS_HORIZONTAL_SYSBP_VSORRES": "132",
            "VS_HORIZONTAL_SYSBP_VSORRESU": "mmHg",
            "VS_HORIZONTAL_DIABP_VSORRES": "84",
            "VS_HORIZONTAL_DIABP_VSORRESU": "mmHg",
            "VS_HORIZONTAL_PULSE_VSORRES": "88",
            "VS_HORIZONTAL_PULSE_VSORRESU": "beats/min",
            "VS_HORIZONTAL_TEMP_VSORRES": "37.1",
            "VS_HORIZONTAL_TEMP_VSORRESU": "C",
        },
        "0103": {
            "VS_HORIZONTAL_VSPERF": "Y",
            "VS_HORIZONTAL_VSDAT": "2026-06-09",
            "VS_HORIZONTAL_SYSBP_VSORRES": "105",
            "VS_HORIZONTAL_SYSBP_VSORRESU": "mmHg",
            "VS_HORIZONTAL_DIABP_VSORRES": "68",
            "VS_HORIZONTAL_DIABP_VSORRESU": "mmHg",
            "VS_HORIZONTAL_PULSE_VSORRES": "65",
            "VS_HORIZONTAL_PULSE_VSORRESU": "beats/min",
            "VS_HORIZONTAL_TEMP_VSORRES": "",
            "VS_HORIZONTAL_TEMP_VSORRESU": "C",
        },
    },
    "AE": {
        "0101": {
            "AE_AESPID": "1",
            "AE_AETERM": "Headache",
            "AE_AESTDAT": "2026-06-01",
            "AE_AEONGO": "N",
            "AE_AESEV": "MILD",
        },
        "0102": {
            "AE_AESPID": "1",
            "AE_AETERM": "Naustea",
            "AE_AESTDAT": "2026-06-03",
            "AE_AEONGO": "Y",
            "AE_AESEV": "MODERATE",
        },
        "0103": {
            "AE_AESPID": "1",
            "AE_AETERM": "",
            "AE_AESTDAT": "",
            "AE_AEONGO": "N",
        },
    },
    "CM": {
        "0101": {
            "CM_CMSPID": "1",
            "CM_CMTRT": "Ibuprofen",
            "CM_CMINDC": "Pain relief",
            "CM_CMSTYY": "2026-05-15",
            "CM_CMONGO": "N",
        },
        "0102": {
            "CM_CMSPID": "1",
            "CM_CMTRT": "Omeprazole",
            "CM_CMINDC": "GERD",
            "CM_CMSTYY": "2026-04-01",
            "CM_CMONGO": "Y",
        },
        "0103": {
            "CM_CMSPID": "1",
            "CM_CMTRT": "Multivitamin",
            "CM_CMINDC": "Supplement",
            "CM_CMSTYY": "2026-01-10",
            "CM_CMONGO": "Y",
        },
    },
    "MH": {
        "0101": {"MH_MHSPID": "1", "MH_MHTERM": "Seasonal allergies", "MH_MHSTDAT": "2010-03-01", "MH_MHONGO": "Y"},
        "0102": {"MH_MHSPID": "1", "MH_MHTERM": "Hypertension", "MH_MHSTDAT": "2015-06-15", "MH_MHONGO": "Y"},
        "0103": {"MH_MHSPID": "1", "MH_MHTERM": "Asthma", "MH_MHSTDAT": "2005-09-20", "MH_MHONGO": "Y"},
    },
    "IE": {
        "0101": {"IE_IEYN": "Y", "IE_IEDAT": "2026-06-10", "IE_IECAT": "INCLUSION", "IE_IETESTCD": "INCL01"},
        "0102": {"IE_IEYN": "Y", "IE_IEDAT": "2026-06-11", "IE_IECAT": "INCLUSION", "IE_IETESTCD": "INCL01"},
        "0103": {"IE_IEYN": "N", "IE_IEDAT": "2026-06-09", "IE_IECAT": "EXCLUSION", "IE_IETESTCD": "EXCL02"},
    },
    "DS": {
        "0101": {"DS_DSDECOD": "COMPLETED", "DS_DSTERM": "Completed screening", "DS_DSSTDAT": "2026-06-10"},
        "0102": {"DS_DSDECOD": "COMPLETED", "DS_DSTERM": "Screening complete", "DS_DSSTDAT": "2026-06-12"},
        "0103": {"DS_DSDECOD": "SCREEN FAILURE", "DS_DSTERM": "Did not meet eligibility", "DS_DSSTDAT": "2026-06-08"},
    },
    "LB": {
        "0101": {
            "LB_LOCAL_LBPERF": "Y",
            "LB_LOCAL_LBDAT": "2026-06-10",
            "LB_LOCAL_ALP_LBORRES": "72",
            "LB_LOCAL_ALP_LBORRESU": "U/L",
        },
        "0102": {
            "LB_LOCAL_LBPERF": "Y",
            "LB_LOCAL_LBDAT": "2026-06-11",
            "LB_LOCAL_CA_LBORRES": "9.2",
            "LB_LOCAL_CA_LBORRESU": "mg/dL",
        },
        "0103": {
            "LB_LOCAL_LBPERF": "Y",
            "LB_LOCAL_LBDAT": "2026-06-09",
            "LB_LOCAL_ALP_LBORRES": "22",
            "LB_LOCAL_ALP_LBORRESU": "U/L",
        },
    },
}

LOW_CONF: dict[str, list[str]] = {
    "0101": [],
    "0102": ["DM_AGE", "DM_ETHNIC", "VS_HORIZONTAL_SYSBP_VSORRES", "AE_AETERM"],
    "0103": ["DM_AGE", "DM_ETHNIC", "VS_HORIZONTAL_TEMP_VSORRES", "AE_AETERM", "IE_IEYN"],
}

# Realistic OCR misreads for fields that land in the review queue (wrong guess → correct on scan).
OCR_MISREADS: dict[tuple[str, str], str] = {
    # 0102 — messy handwriting
    ("0102", "DM_AGE"): "58",
    ("0102", "DM_ETHNIC"): "NOT  HISPANIC  OR  LATINO",
    ("0102", "VS_HORIZONTAL_SYSBP_VSORRES"): "138",
    # 0103 — partial / low-confidence pass (all flagged for coordinator review)
    ("0103", "AE_AESPID"): "7",
    ("0103", "AE_AEONGO"): "Y",
    ("0103", "CM_CMSPID"): "7",
    ("0103", "CM_CMTRT"): "Multivitarnin",
    ("0103", "CM_CMINDC"): "Suppiement",
    ("0103", "CM_CMSTYY"): "2026-01-16",
    ("0103", "CM_CMONGO"): "N",
    ("0103", "DM_BRTHDAT"): "1980-12-28",
    ("0103", "DM_AGEU"): "YERS",
    ("0103", "DM_SEX"): "E",
    ("0103", "DM_RACE"): "BLACK OR AFRICAN AMERlCAN",
    ("0103", "DS_DSDECOD"): "SCREEN FAILUR",
    ("0103", "DS_DSTERM"): "Did not meat eligibility",
    ("0103", "DS_DSSTDAT"): "2026-06-09",
    ("0103", "IE_IEYN"): "Y",
    ("0103", "IE_IEDAT"): "2026-06-06",
    ("0103", "IE_IECAT"): "INCLUSION",
    ("0103", "IE_IETESTCD"): "INCL01",
    ("0103", "LB_LOCAL_LBPERF"): "N",
    ("0103", "LB_LOCAL_LBDAT"): "2026-06-19",
    ("0103", "LB_LOCAL_ALP_LBORRES"): "72",
    ("0103", "LB_LOCAL_ALP_LBORRESU"): "UI",
    ("0103", "MH_MHSPID"): "7",
    ("0103", "MH_MHTERM"): "Athsma",
    ("0103", "MH_MHSTDAT"): "2005-09-26",
    ("0103", "MH_MHONGO"): "N",
    ("0103", "VS_HORIZONTAL_VSPERF"): "N",
    ("0103", "VS_HORIZONTAL_VSDAT"): "2026-06-06",
    ("0103", "VS_HORIZONTAL_SYSBP_VSORRES"): "108",
    ("0103", "VS_HORIZONTAL_SYSBP_VSORRESU"): "cmHg",
    ("0103", "VS_HORIZONTAL_DIABP_VSORRES"): "86",
    ("0103", "VS_HORIZONTAL_DIABP_VSORRESU"): "mmHq",
    ("0103", "VS_HORIZONTAL_PULSE_VSORRES"): "95",
    ("0103", "VS_HORIZONTAL_PULSE_VSORRESU"): "beat/min",
    ("0103", "VS_HORIZONTAL_TEMP_VSORRESU"): "F",
}


def _apply_ocr_misreads(subject_id: str, fields: dict[str, dict]) -> None:
    for name, meta in fields.items():
        guess = OCR_MISREADS.get((subject_id, name))
        if guess is None:
            continue
        meta["correct_value"] = meta.get("value", "")
        meta["value"] = guess


def _build_fields(subject_id: str, form_code: str) -> dict[str, dict]:
    raw = FORM_VALUES.get(form_code, {}).get(subject_id, {})
    style = "neat" if subject_id == "0101" else ("messy" if subject_id == "0102" else "partial")
    low = set(LOW_CONF.get(subject_id, []))
    out: dict[str, dict] = {}
    for name, val in raw.items():
        meta: dict = {"value": val}
        if name in low:
            meta["confidence"] = 0.68 if style == "messy" else 0.55
            meta["force_review"] = True
        elif style == "neat":
            meta["confidence"] = 0.96
        elif style == "messy":
            meta["confidence"] = 0.88
        else:
            meta["confidence"] = 0.82 if val else 0.5
            if not val:
                meta["force_review"] = True
        out[name] = meta
    _apply_ocr_misreads(subject_id, out)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    count = 0
    for subject_id in ALL_SUBJECTS:
        for form_code in FORMS:
            payload = {
                "subject_id": subject_id,
                "form_code": form_code,
                "fields": _build_fields(subject_id, form_code),
            }
            path = OUT / f"{subject_id}_{form_code}.json"
            path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            count += 1
    print(f"Wrote {count} extraction payloads to {OUT}")


if __name__ == "__main__":
    main()
