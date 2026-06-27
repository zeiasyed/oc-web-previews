#!/usr/bin/env python3
"""Download ClinSpark CSVs from Google Drive into demo_data/raw_csv/."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.constants import FOLDER_RAW_CS
from shared.drive_utils import download_bytes, get_drive_service, list_files

OUT = ROOT / "demo_data" / "raw_csv"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print("Connecting to Google Drive...")
    service = get_drive_service()
    files = list_files(service, FOLDER_RAW_CS)
    csvs = [f for f in files if f["name"].lower().endswith(".csv")]
    print(f"Downloading {len(csvs)} CSV files...")
    for i, f in enumerate(csvs, 1):
        dest = OUT / f["name"]
        if dest.exists() and dest.stat().st_size > 0:
            print(f"  [{i}/{len(csvs)}] skip (exists) {f['name']}")
            continue
        print(f"  [{i}/{len(csvs)}] {f['name']}")
        data = download_bytes(service, f["id"])
        dest.write_bytes(data)
    print("Done.")


if __name__ == "__main__":
    main()
