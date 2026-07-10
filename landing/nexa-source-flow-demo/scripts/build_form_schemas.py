#!/usr/bin/env python3
"""Build form_schemas/ from source_values.json field names."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "demo_data" / "source_values.json"
OUT = ROOT / "demo_data" / "form_schemas"


def slug(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.lower())
    s = re.sub(r"[\s]+", "_", s.strip())
    return (s[:80] or "form")


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    fields_by_form: dict[str, set[str]] = defaultdict(set)
    for visits in source.values():
        for forms in visits.values():
            for form, fields in forms.items():
                fields_by_form[form].update(fields.keys())

    OUT.mkdir(parents=True, exist_ok=True)
    index: dict[str, str] = {}
    for form in sorted(fields_by_form):
        key = slug(form)
        index[form] = key
        schema = {
            "form": form,
            "fields": [{"name": f, "label": f} for f in sorted(fields_by_form[form])],
        }
        (OUT / f"{key}.json").write_text(json.dumps(schema, indent=2), encoding="utf-8")

    (OUT / "_index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"Wrote {len(index)} form schemas to {OUT}")


if __name__ == "__main__":
    main()
