"""Validate extracted CDASH field values against schema rules."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _field_def(schema: dict[str, Any], name: str) -> dict[str, Any] | None:
    for f in schema.get("fields", []):
        if f.get("name") == name:
            return f
    return None


def validate_field(name: str, value: str, schema: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    fdef = _field_def(schema, name)
    if not fdef:
        return issues

    ftype = fdef.get("type", "")
    val = (value or "").strip()

    if fdef.get("required") and not val:
        issues.append("missing_required")
        return issues

    if not val:
        return issues

    if ftype in ("integer", "decimal"):
        try:
            float(val) if ftype == "decimal" else int(val)
        except ValueError:
            issues.append("invalid_number")

    if ftype == "date":
        if not DATE_RE.match(val):
            issues.append("invalid_date")
        else:
            try:
                datetime.strptime(val, "%Y-%m-%d")
            except ValueError:
                issues.append("invalid_date")

    if ftype.startswith("select_"):
        codes = {c["code"] for c in fdef.get("choices", [])}
        if codes and val not in codes:
            issues.append("codelist_mismatch")

    return issues


def validate_extraction(
    fields: dict[str, dict[str, Any]],
    schema: dict[str, Any],
) -> dict[str, list[str]]:
    """Return field_name -> list of issue codes."""
    result: dict[str, list[str]] = {}
    for name, meta in fields.items():
        value = str(meta.get("value") or "")
        issues = validate_field(name, value, schema)
        if issues:
            result[name] = issues
    return result


def cross_validate(fields: dict[str, dict[str, Any]]) -> dict[str, list[str]]:
    """Cross-field checks (age vs DOB when both on DM)."""
    issues: dict[str, list[str]] = {}
    age_meta = fields.get("DM_AGE")
    dob_meta = fields.get("DM_BRTHDAT") or fields.get("DM_BRTHDTC")
    if age_meta and dob_meta:
        age_s = str(age_meta.get("value") or "").strip()
        dob_s = str(dob_meta.get("value") or "").strip()
        if age_s and dob_s and DATE_RE.match(dob_s):
            try:
                age = int(float(age_s))
                dob = datetime.strptime(dob_s, "%Y-%m-%d")
                implied = (datetime.now() - dob).days // 365
                if abs(implied - age) > 2:
                    issues.setdefault("DM_AGE", []).append("cross_check_age_dob")
            except ValueError:
                pass
    return issues
