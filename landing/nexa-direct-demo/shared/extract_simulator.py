"""Simulated OCR extraction from pre-authored JSON payloads."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from shared.constants import SUBJECTS
from shared.inbox_watcher import parse_filename

ROOT = Path(__file__).resolve().parents[1]
EXTRACTIONS_DIR = ROOT / "demo_data" / "simulated_extractions"


def resolved_field_value(meta: dict[str, Any]) -> str:
    """Ground truth for EDC — correct_value when OCR misread is staged for review."""
    if "correct_value" in meta:
        return str(meta.get("correct_value") or "")
    return str(meta.get("value") or "")


STYLE_CONFIDENCE = {
    "neat": 0.95,
    "messy": 0.72,
    "partial": 0.78,
}


def _subject_style(subject_id: str) -> str:
    for s in SUBJECTS:
        if s["subject_id"] == subject_id:
            return s["handwriting_style"]
    return "neat"


def _load_payload(subject_id: str, form_code: str) -> dict[str, Any]:
    path = EXTRACTIONS_DIR / f"{subject_id}_{form_code}.json"
    if not path.exists():
        return {"fields": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def extract_from_filename(filename: str) -> dict[str, Any]:
    parsed = parse_filename(filename)
    if not parsed:
        raise ValueError(f"Unrecognized inbox filename: {filename}")
    subject_id, form_code = parsed
    return extract(subject_id, form_code, filename)


def extract(subject_id: str, form_code: str, filename: str = "") -> dict[str, Any]:
    style = _subject_style(subject_id)
    payload = _load_payload(subject_id, form_code)
    base_conf = STYLE_CONFIDENCE.get(style, 0.85)
    fields: dict[str, dict[str, Any]] = {}

    for name, meta in payload.get("fields", {}).items():
        if isinstance(meta, dict):
            value = meta.get("value", "")
            conf = float(meta.get("confidence", base_conf))
            low = bool(meta.get("force_review", False))
            correct_value = meta.get("correct_value")
        else:
            value = meta
            conf = base_conf
            low = False
            correct_value = None
        if low or conf < 0.85:
            conf = min(conf, 0.72 if style == "messy" else 0.65)
        entry: dict[str, Any] = {"value": value, "confidence": conf}
        if correct_value is not None:
            entry["correct_value"] = correct_value
        fields[name] = entry

    return {
        "filename": filename or f"{subject_id}_{form_code}.pdf",
        "subject_id": subject_id,
        "form_code": form_code,
        "handwriting_style": style,
        "fields": fields,
    }
