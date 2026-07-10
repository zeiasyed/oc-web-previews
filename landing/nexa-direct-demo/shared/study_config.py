"""Per-study configuration — CRC-managed site setup and form definitions."""

from __future__ import annotations

import json
import re
import shutil
import threading
from copy import deepcopy
from pathlib import Path
from typing import Any

from shared.cdash_schemas import load_schema, parse_excel, save_schema
from shared.constants import (
    AUTO_WRITE_THRESHOLD,
    DEFAULT_VISIT,
    DEMO_STUDIES,
    DISPLAY_INBOX_PATH,
    FORM_ORDER,
    FORMS,
    INBOX_PATH,
    SITE_ID,
    SITE_NAME,
    STUDY_ID,
    STUDY_NAME,
    VISITS,
)

ROOT = Path(__file__).resolve().parents[1]
STUDIES_DIR = ROOT / "study_config" / "studies"
DEFAULT_SCHEMAS_DIR = ROOT / "demo_data" / "schemas"
_UPLOADS_DIR = ROOT / "study_config" / "uploads"

_lock = threading.Lock()
_active_study_id: str | None = None


def active_study_id() -> str:
    return _active_study_id or STUDY_ID


def set_active_study(study_id: str) -> None:
    global _active_study_id
    _active_study_id = study_id


def _study_path(study_id: str) -> Path:
    safe = re.sub(r"[^\w\-]", "", study_id)
    return STUDIES_DIR / f"{safe}.json"


def schema_dir(study_id: str) -> Path:
    safe = re.sub(r"[^\w\-]", "", study_id)
    return STUDIES_DIR / safe / "schemas"


def bootstrap_if_needed() -> None:
    """Seed study configs from constants when none exist."""
    STUDIES_DIR.mkdir(parents=True, exist_ok=True)
    if any(STUDIES_DIR.glob("*.json")):
        return

    forms: dict[str, Any] = {}
    for code, meta in FORMS.items():
        forms[code] = {
            "enabled": True,
            "title": meta["title"],
            "form_id": meta["form_id"],
            "file_code": meta["file_code"],
            "field_labels": {},
        }

    primary = {
        "id": STUDY_ID,
        "name": STUDY_NAME,
        "site_id": SITE_ID,
        "site_name": SITE_NAME,
        "default_visit": DEFAULT_VISIT,
        "disabled": False,
        "inbox_path": str(INBOX_PATH),
        "display_inbox_path": DISPLAY_INBOX_PATH,
        "auto_write_threshold": AUTO_WRITE_THRESHOLD,
        "form_order": list(FORM_ORDER),
        "forms": forms,
    }
    _write_config(STUDY_ID, primary)

    for s in DEMO_STUDIES:
        if s["id"] == STUDY_ID:
            continue
        stub = {
            "id": s["id"],
            "name": s["label"].split(" — ", 1)[-1] if " — " in s["label"] else s["label"],
            "site_id": SITE_ID,
            "site_name": SITE_NAME,
            "default_visit": DEFAULT_VISIT,
            "disabled": bool(s.get("disabled")),
            "inbox_path": str(INBOX_PATH),
            "display_inbox_path": DISPLAY_INBOX_PATH,
            "auto_write_threshold": AUTO_WRITE_THRESHOLD,
            "form_order": list(FORM_ORDER),
            "forms": deepcopy(forms),
        }
        _write_config(s["id"], stub)


def _write_config(study_id: str, data: dict[str, Any]) -> None:
    path = _study_path(study_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_config(study_id: str | None = None) -> dict[str, Any]:
    bootstrap_if_needed()
    sid = study_id or active_study_id()
    path = _study_path(sid)
    if not path.exists():
        raise KeyError(f"Unknown study: {sid}")
    return json.loads(path.read_text(encoding="utf-8"))


def save_config(study_id: str, data: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        data = deepcopy(data)
        data["id"] = study_id
        _write_config(study_id, data)
        return data


def update_config(study_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        cfg = get_config(study_id)
        for key, val in patch.items():
            if key == "forms" and isinstance(val, dict):
                cfg.setdefault("forms", {})
                for form_code, form_patch in val.items():
                    if form_code not in cfg["forms"]:
                        cfg["forms"][form_code] = {}
                    if isinstance(form_patch, dict):
                        cfg["forms"][form_code].update(form_patch)
                    else:
                        cfg["forms"][form_code] = form_patch
            else:
                cfg[key] = val
        _write_config(study_id, cfg)
        return cfg


def list_studies() -> list[dict[str, Any]]:
    bootstrap_if_needed()
    out: list[dict[str, Any]] = []
    for path in sorted(STUDIES_DIR.glob("*.json")):
        cfg = json.loads(path.read_text(encoding="utf-8"))
        sid = cfg.get("id") or path.stem
        label = f"{sid} — {cfg.get('name', sid)}"
        out.append(
            {
                "id": sid,
                "label": label,
                "disabled": bool(cfg.get("disabled")),
                "site_name": cfg.get("site_name", ""),
            }
        )
    out.sort(key=lambda s: (s["disabled"], s["id"] != STUDY_ID, s["id"]))
    return out


def study_label(study_id: str) -> str:
    cfg = get_config(study_id)
    return f"{study_id} — {cfg.get('name', study_id)}"


def is_study_active(study_id: str) -> bool:
    try:
        return not bool(get_config(study_id).get("disabled"))
    except KeyError:
        return False


def get_forms(study_id: str | None = None) -> dict[str, dict[str, Any]]:
    cfg = get_config(study_id)
    forms = cfg.get("forms") or {}
    order = cfg.get("form_order") or list(forms.keys())
    ordered: dict[str, dict[str, Any]] = {}
    for code in order:
        if code in forms:
            ordered[code] = forms[code]
    for code, meta in forms.items():
        if code not in ordered:
            ordered[code] = meta
    return ordered


def enabled_forms(study_id: str | None = None) -> dict[str, dict[str, Any]]:
    return {k: v for k, v in get_forms(study_id).items() if v.get("enabled", True)}


def form_order(study_id: str | None = None) -> list[str]:
    cfg = get_config(study_id)
    codes = [c for c in cfg.get("form_order") or [] if c in enabled_forms(study_id)]
    for code in enabled_forms(study_id):
        if code not in codes:
            codes.append(code)
    return codes


def inbox_path(study_id: str | None = None) -> Path:
    cfg = get_config(study_id)
    return Path(cfg.get("inbox_path") or str(INBOX_PATH))


def display_inbox_path(study_id: str | None = None) -> str:
    cfg = get_config(study_id)
    display = (cfg.get("display_inbox_path") or "").strip()
    if display:
        return display
    return str(inbox_path(study_id))


def auto_write_threshold(study_id: str | None = None) -> float:
    cfg = get_config(study_id)
    try:
        return float(cfg.get("auto_write_threshold", AUTO_WRITE_THRESHOLD))
    except (TypeError, ValueError):
        return AUTO_WRITE_THRESHOLD


def default_visit(study_id: str | None = None) -> str:
    cfg = get_config(study_id)
    return cfg.get("default_visit") or DEFAULT_VISIT


def protocol_visits(study_id: str | None = None) -> list[str]:
    """Visits defined for this study protocol (demo uses shared VISITS list)."""
    _ = study_id
    return list(VISITS)


def _apply_label_overrides(schema: dict[str, Any], overrides: dict[str, str]) -> dict[str, Any]:
    if not overrides:
        return schema
    schema = deepcopy(schema)
    for field in schema.get("fields", []):
        name = field.get("name")
        if name and name in overrides and overrides[name].strip():
            field["label"] = overrides[name].strip()
    return schema


def load_study_schema(study_id: str, form_code: str) -> dict[str, Any] | None:
    study_schemas = schema_dir(study_id)
    schema = load_schema(form_code, study_schemas)
    if schema is None:
        schema = load_schema(form_code, DEFAULT_SCHEMAS_DIR)
    if schema is None:
        return None
    forms = get_forms(study_id)
    overrides = (forms.get(form_code) or {}).get("field_labels") or {}
    return _apply_label_overrides(schema, overrides)


def list_form_definitions(study_id: str) -> list[dict[str, Any]]:
    forms = get_forms(study_id)
    out: list[dict[str, Any]] = []
    for code, meta in forms.items():
        schema = load_study_schema(study_id, code) or {"fields": []}
        fields = []
        overrides = meta.get("field_labels") or {}
        for f in schema.get("fields", []):
            name = f.get("name", "")
            fields.append(
                {
                    "name": name,
                    "label": overrides.get(name) or f.get("label") or name,
                    "base_label": f.get("label") or name,
                    "type": f.get("type", ""),
                    "required": bool(f.get("required")),
                }
            )
        out.append(
            {
                "form_code": code,
                "enabled": bool(meta.get("enabled", True)),
                "title": meta.get("title", code),
                "form_id": meta.get("form_id", code),
                "file_code": meta.get("file_code", code),
                "field_count": len(fields),
                "fields": fields,
            }
        )
    return out


def save_form_settings(
    study_id: str,
    form_code: str,
    *,
    enabled: bool | None = None,
    title: str | None = None,
    file_code: str | None = None,
    field_labels: dict[str, str] | None = None,
) -> dict[str, Any]:
    patch: dict[str, Any] = {"forms": {form_code: {}}}
    fm = patch["forms"][form_code]
    if enabled is not None:
        fm["enabled"] = enabled
    if title is not None:
        fm["title"] = title.strip()
    if file_code is not None:
        fm["file_code"] = file_code.strip().upper()
    if field_labels is not None:
        fm["field_labels"] = {k: v.strip() for k, v in field_labels.items() if v.strip()}
    return update_config(study_id, patch)


def import_form_excel(
    study_id: str,
    form_code: str,
    excel_path: Path,
    *,
    title: str | None = None,
    file_code: str | None = None,
) -> dict[str, Any]:
    parsed = parse_excel(excel_path)
    code = form_code.strip().upper() or parsed.get("form_id", "FORM").split("_")[0][:8]
    out_dir = schema_dir(study_id)
    save_schema(parsed, code, out_dir)

    cfg = get_config(study_id)
    existing = (cfg.get("forms") or {}).get(code, {})
    form_meta = {
        "enabled": existing.get("enabled", True),
        "title": title or parsed.get("title") or existing.get("title") or code,
        "form_id": parsed.get("form_id") or existing.get("form_id") or code,
        "file_code": (file_code or existing.get("file_code") or parsed.get("form_id") or code).upper(),
        "field_labels": existing.get("field_labels") or {},
    }
    forms_patch = {code: form_meta}
    order = list(cfg.get("form_order") or [])
    if code not in order:
        order.append(code)
    update_config(study_id, {"forms": forms_patch, "form_order": order})
    return {"form_code": code, "title": form_meta["title"], "fields": len(parsed.get("fields", []))}


def validate_inbox_path(path_str: str, study_id: str | None = None) -> tuple[bool, str]:
    from shared.inbox_watcher import probe_inbox_folder

    result = probe_inbox_folder(Path(path_str.strip()), study_id)
    return result["valid"], result["message"]


def public_summary(study_id: str | None = None) -> dict[str, Any]:
    sid = study_id or active_study_id()
    cfg = get_config(sid)
    ok, inbox_msg = validate_inbox_path(cfg.get("inbox_path", ""), sid)
    return {
        "id": sid,
        "name": cfg.get("name", sid),
        "site_id": cfg.get("site_id", ""),
        "site_name": SITE_NAME,
        "default_visit": cfg.get("default_visit", DEFAULT_VISIT),
        "visits": protocol_visits(sid),
        "disabled": bool(cfg.get("disabled")),
        "inbox_path": cfg.get("inbox_path", ""),
        "display_inbox_path": display_inbox_path(sid),
        "auto_write_threshold": auto_write_threshold(sid),
        "inbox_valid": ok,
        "inbox_message": inbox_msg,
        "enabled_form_count": len(enabled_forms(sid)),
    }


def save_site_settings(study_id: str, body: dict[str, Any]) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    for key in (
        "name",
        "site_id",
        "site_name",
        "default_visit",
        "inbox_path",
        "display_inbox_path",
        "auto_write_threshold",
        "disabled",
    ):
        if key in body:
            patch[key] = body[key]
    if "auto_write_threshold" in patch:
        try:
            val = float(patch["auto_write_threshold"])
            if not 0 < val <= 1:
                raise ValueError
            patch["auto_write_threshold"] = round(val, 2)
        except (TypeError, ValueError):
            raise ValueError("Confidence threshold must be between 0 and 1") from None
    if "default_visit" in patch:
        visit = str(patch["default_visit"]).strip()
        allowed = protocol_visits(study_id)
        if visit not in allowed:
            raise ValueError(f"Default visit must be one of: {', '.join(allowed)}")
        patch["default_visit"] = visit
    patch["site_name"] = SITE_NAME
    return update_config(study_id, patch)


def uploads_dir() -> Path:
    _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    return _UPLOADS_DIR
