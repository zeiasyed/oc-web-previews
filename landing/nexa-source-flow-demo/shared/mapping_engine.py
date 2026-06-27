"""ClinSpark CSV → Rave form field mapping helpers."""

from __future__ import annotations

import re

SKIP_COLUMNS = {
    "subject", "study event", "study", "site", "form", "item group",
    "record id", "record position", "created", "modified", "status",
}


def norm_visit(raw: str) -> str:
    s = str(raw or "").strip()
    if not s:
        return ""
    low = s.lower().replace("-", " ").replace("_", " ")
    if "screen" in low:
        return "Screening"
    m = re.search(r"day\s*(-?\d+)", low)
    if m:
        return f"Day {m.group(1)}"
    return s


def norm_key(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(s).lower())


def extract_subject_id(raw: str) -> str | None:
    m = re.match(r"^(\d{4})", str(raw).strip())
    return m.group(1) if m else None


def fmt_date_rave(s: str) -> str:
    if not s:
        return ""
    s = str(s).strip()
    if re.match(r"^\d{2}\s+[A-Z]{3}\s+\d{4}$", s):
        return s
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        months = {
            "01": "JAN", "02": "FEB", "03": "MAR", "04": "APR", "05": "MAY",
            "06": "JUN", "07": "JUL", "08": "AUG", "09": "SEP", "10": "OCT",
            "11": "NOV", "12": "DEC",
        }
        return f"{m.group(3)} {months.get(m.group(2), m.group(2))} {m.group(1)}"
    m = re.match(r"(\d{1,2})([A-Za-z]{3})(\d{4})", s)
    if m:
        return f"{int(m.group(1)):02d} {m.group(2).upper()} {m.group(3)}"
    return s


def fmt_time(s: str) -> str:
    if not s:
        return ""
    m = re.search(r"T(\d{2}:\d{2})", str(s))
    if m:
        return m.group(1)
    m = re.search(r"(\d{2}:\d{2})", str(s))
    return m.group(1) if m else ""


def infer_forms_from_filename(name: str) -> list[str]:
    n = name.lower().replace(".csv", "")
    rules = [
        (["visit status"], ["Date of Visit"]),
        (["informed consent", "disposition - informed"], ["Disposition - Informed Consent"]),
        (["inclusion", "exclusion"], ["Inclusion/Exclusion Criteria"]),
        (["demographic"], ["Demographics"]),
        (["medical history"], ["Medical History Summary"]),
        (["pregnancy history"], ["Pregnancy History"]),
        (["abbreviated physical", "physical exam"], ["Abbreviated Physical Examination"]),
        (["body measurement", "vital signs body"], ["Vital Signs (Body Measurement)"]),
        (["supine vital", "vital signs collection"], ["Vital Signs"]),
        (["12-lead", "ecg collection"], ["12-Lead ECG"]),
        (["pregnancy test - serum", "pregnancy test serum"], ["Pregnancy Test - Serum"]),
        (["pregnancy test - urine"], ["Pregnancy Test - Urine"]),
        (["reproductive"], ["Reproductive System Findings"]),
        (["fsh"], ["FSH Test"]),
        (["clinical chemistry"], ["Clinical Chemistry"]),
        (["hematology"], ["Hematology"]),
        (["thyroid"], ["Thyroid Stimulating Hormone"]),
        (["serology"], ["Serology"]),
        (["drug screen"], ["Drug Screen"]),
        (["alcohol"], ["Alcohol Test"]),
        (["urinalysis", "urinanalysis"], ["Urinalysis"]),
        (["egfr"], ["eGFR"]),
        (["lipid profile scrn", "complete lipid profile scrn"], ["Complete Lipid Profile SCRN"]),
        (["randomization"], ["Randomization"]),
        (["study assignment", "study assign"], ["Study assignment"]),
        (["evolocumab serum pk", "pk collection"], ["Evolocumab Serum PK Collection"]),
        (["anti-evolocumab", "anti evolocumab"], ["Anti-Evolocumab Antibody"]),
        (["complete lipid profile"], ["Complete Lipid Profile"]),
        (["pcsk9"], ["PCSK9 Serum Level"]),
        (["evolocumab admin"], ["Evolocumab Administration"]),
        (["adverse event"], ["Adverse Events Summary"]),
        (["concomitant", "cm_"], ["Prior and Concomitant Medications Summary", "Prior and Concomitant Medications"]),
        (["end of study", "disposition - end"], ["Disposition - End of Study"]),
        (["lab_d2", "lab_day"], ["Evolocumab Serum PK Collection", "Complete Lipid Profile", "PCSK9 Serum Level"]),
    ]
    forms: list[str] = []
    for keys, targets in rules:
        if any(k in n for k in keys):
            forms.extend(targets)
    return list(dict.fromkeys(forms))


def row_to_fields(row: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    for col, val in row.items():
        if not val or not str(val).strip():
            continue
        if norm_key(col) in SKIP_COLUMNS:
            continue
        label = col.strip()
        v = str(val).strip()
        if "date" in label.lower() or "time" in label.lower():
            if "T" in v or re.match(r"\d{4}-\d{2}-\d{2}", v):
                if "time" in label.lower() and "date" not in label.lower():
                    v = fmt_time(v) or v
                elif "date" in label.lower():
                    v = fmt_date_rave(v.split("T")[0] if "T" in v else v.split(" ")[0])
                else:
                    d, t = fmt_date_rave(v.split("T")[0] if "T" in v else v), fmt_time(v)
                    if d:
                        out[label] = d
                    if t and "time" in label.lower():
                        out[label] = t
                    continue
        out[label] = v.split(" ")[0] if any(u in label.lower() for u in ("bp", "pressure", "rate", "temp")) else v
    return out
