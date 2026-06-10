"""Count OSM trade candidates without live websites."""
import json
import sys
sys.path.insert(0, "scripts")
from discover_trades import classify_trade, row_from_element, load_excluded, overpass_trades
from discover_businesses import dedupe_by_name

excluded = load_excluded()
rows = []
for el in overpass_trades():
    tags = el.get("tags") or {}
    name = tags.get("name")
    if not name:
        continue
    trade = classify_trade(name, tags)
    if not trade:
        continue
    row = row_from_element(name, tags, trade, excluded)
    if row:
        rows.append(row)

rows = dedupe_by_name(rows)
sys.stdout.reconfigure(encoding="utf-8")
print("qualified", len(rows))
for t in ("plumber", "hvac", "roofer"):
    n = sum(1 for r in rows if r["trade"] == t)
    print(t, n)
for r in rows:
    print(f"[{r['trade']}] {r['name']} | {r['city']} | {r.get('website_listed','')}")
