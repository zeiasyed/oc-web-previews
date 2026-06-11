import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
rows = list(csv.DictReader((ROOT / "data" / "tx-plumbers-200.csv").open(encoding="utf-8")))
payload = []
for row in rows:
    if row.get("verification_status") not in ("approved", "", "unverified", None):
        continue
    entry = {
        "slug": row["slug"],
        "name": row["name"],
        "industry": row.get("industry"),
        "preview_path": f"previews/{row['slug']}/index.html",
    }
    if row.get("trade"):
        entry["trade"] = row["trade"]
    payload.append(entry)

(ROOT / "landing" / "businesses.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
(ROOT / "landing" / "assets" / "businesses.js").write_text(
    f"window.BUSINESSES = {json.dumps(payload, indent=2)};\n",
    encoding="utf-8",
)
print(f"Synced {len(payload)} businesses (zeia removed)")
