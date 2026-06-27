#!/usr/bin/env python3
"""Parse saved Rave HTML exports into form schema JSON."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_DIR = ROOT / "demo_data" / "rave_html"
OUT_DIR = ROOT / "demo_data" / "form_schemas"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def extract_fields(html: str) -> list[dict]:
    fields: list[dict] = []
    seen: set[str] = set()

    for m in re.finditer(
        r'<span[^>]*class="[^"]*fieldLabel[^"]*"[^>]*>([^<]+)</span>',
        html,
        re.I,
    ):
        label = re.sub(r"\s+", " ", m.group(1)).strip().rstrip(":")
        if label and label not in seen:
            seen.add(label)
            fields.append({"label": label, "type": "text"})

    for m in re.finditer(r'id="field(F\d+)"', html):
        fid = m.group(1)
        if fid not in seen:
            seen.add(fid)
            fields.append({"label": fid, "type": "field_id", "field_id": fid})

    title_m = re.search(r"<title>\s*CRF\s*</title>", html, re.I)
    form_m = re.search(r'title="([^"]+)"[^>]*>[^<]*</a>\s*</td>\s*<td><img[^>]*tab_ar', html, re.S)
    if not form_m:
        form_m = re.search(r'TabTextHyperlink\d+"[^>]*title="([^"]+)"', html)
    form_name = form_m.group(1).strip() if form_m else Path(html).stem
    return fields


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not HTML_DIR.exists():
        print("No rave_html folder.")
        return

    index: dict[str, str] = {}
    for path in HTML_DIR.rglob("*.txt*"):
        text = path.read_text(encoding="utf-8", errors="replace")
        if "fieldLabel" not in text and "fieldF" not in text:
            continue
        fields = extract_fields(text)
        if not fields:
            continue
        form_m = re.search(r'TabTextHyperlink\d+"[^>]*title="([^"]+)"', text)
        form_name = form_m.group(1).strip() if form_m else path.stem.replace("_", " ")
        key = slug(form_name)
        schema = {"form": form_name, "fields": fields[:80]}
        (OUT_DIR / f"{key}.json").write_text(json.dumps(schema, indent=2), encoding="utf-8")
        index[form_name] = key

    (OUT_DIR / "_index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"Parsed {len(index)} form schemas -> {OUT_DIR}")


if __name__ == "__main__":
    main()
