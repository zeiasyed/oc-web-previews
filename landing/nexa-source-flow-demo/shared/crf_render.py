"""Build CRF field rows for mock EDC display."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = ROOT / "demo_data" / "form_schemas"
INDEX_PATH = SCHEMA_DIR / "_index.json"


def load_form_schema(form_name: str) -> dict | None:
    if not INDEX_PATH.exists():
        return None
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    key = index.get(form_name)
    if not key:
        return None
    path = SCHEMA_DIR / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def build_crf_fields(form: str, values: dict[str, str]) -> list[dict]:
    """Merge SQLite values with form schema for CRF rendering."""
    schema = load_form_schema(form)
    fields: list[dict] = []
    if schema:
        for f in schema.get("fields", []):
            name = f.get("name") or f.get("label", "")
            label = f.get("label", name)
            val = values.get(name, values.get(label, ""))
            fields.append(
                {
                    "name": name,
                    "label": label,
                    "value": val,
                    "synced": bool(str(val).strip()),
                }
            )
    if not fields and values:
        fields = [
            {
                "name": k,
                "label": k,
                "value": v,
                "synced": bool(str(v).strip()),
            }
            for k, v in sorted(values.items())
        ]
    return fields


def crf_display_values(
    form: str,
    values: dict[str, str],
    loader: Callable[[str], dict | None] | None = None,
) -> dict[str, str]:
    """Map field label -> displayed value (what the CRF table shows)."""
    load = loader or load_form_schema
    schema = load(form)
    out: dict[str, str] = {}
    if schema:
        for f in schema.get("fields", []):
            name = f.get("name") or f.get("label", "")
            label = f.get("label", name)
            val = values.get(name, values.get(label, ""))
            out[label] = str(val) if val else ""
    elif values:
        out = {k: str(v) for k, v in values.items()}
    return out
