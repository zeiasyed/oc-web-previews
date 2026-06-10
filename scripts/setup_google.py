"""Save Google Places API key to config/google.json (local only, gitignored)."""

from __future__ import annotations

import json
import sys
from getpass import getpass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "google.json"
EXAMPLE = ROOT / "config" / "google.json.example"


def main() -> None:
    print("Google Places API setup for Solena Digital verification")
    print("Get a key: https://console.cloud.google.com/apis/library/places.googleapis.com")
    print("Enable: Places API (New)")
    print()

    if len(sys.argv) > 1:
        key = sys.argv[1].strip()
    else:
        key = getpass("Paste your Places API key (hidden): ").strip()

    if not key:
        raise SystemExit("No key provided.")

    CONFIG.write_text(json.dumps({"places_api_key": key}, indent=2) + "\n", encoding="utf-8")
    print(f"\nSaved to {CONFIG}")
    print("Run: python scripts/test_google_places.py")


if __name__ == "__main__":
    main()
