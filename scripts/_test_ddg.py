"""Test DDG trade discovery output."""
import sys
sys.path.insert(0, "scripts")
from discover_trades import ddg_discover_city

sys.stdout.reconfigure(encoding="utf-8")
for trade in ("plumber", "hvac", "roofer"):
    rows = ddg_discover_city(trade, "Anaheim")
    print(trade, len(rows))
    for r in rows[:8]:
        print(" ", r["name"])
