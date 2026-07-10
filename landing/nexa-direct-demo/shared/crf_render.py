"""Build CRF field rows for mock NexaDirect EDC display."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from shared.cdash_schemas import load_schema

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SCHEMA_DIR = ROOT / "demo_data" / "schemas"


def build_crf_fields(
    form_code: str,
    values: dict[str, str],
    schema_dir: Path | None = None,
) -> list[dict[str, Any]]:
    schema = load_schema(form_code, schema_dir or DEFAULT_SCHEMA_DIR)
    fields: list[dict[str, Any]] = []
    if schema:
        for f in schema.get("fields", []):
            name = f.get("name", "")
            label = f.get("label", name)
            val = values.get(name, "")
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
    form_code: str,
    values: dict[str, str],
    schema_dir: Path | None = None,
) -> dict[str, str]:
    """Field name -> value as shown on the CRF (by CDASH field name)."""
    out: dict[str, str] = {}
    for row in build_crf_fields(form_code, values, schema_dir):
        out[row["name"]] = str(row["value"]) if row["value"] else ""
    return out
