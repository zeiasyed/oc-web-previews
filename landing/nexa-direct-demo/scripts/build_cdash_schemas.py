"""Build CDASH JSON schemas from OpenClinica Excel files."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.cdash_schemas import parse_excel, save_schema
from shared.constants import FORMS

OUT = ROOT / "demo_data" / "schemas"


def main() -> None:
    index: dict[str, str] = {}
    for code, meta in FORMS.items():
        excel = meta["excel"]
        if not excel.exists():
            print(f"SKIP {code}: missing {excel}")
            continue
        schema = parse_excel(excel)
        schema["form_code"] = code
        save_schema(schema, code, OUT)
        index[code] = code
        print(f"Wrote {code}.json ({len(schema['fields'])} fields)")
    (OUT / "_index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"Done — {len(index)} schemas in {OUT}")


if __name__ == "__main__":
    main()
