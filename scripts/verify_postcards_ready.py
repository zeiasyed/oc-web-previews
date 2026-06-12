#!/usr/bin/env python3
"""Verify all batch postcard PNGs exist locally and on GitHub Pages."""

from __future__ import annotations

import csv
import json
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "tx-plumbers-200.csv"
PNG_DIR = ROOT / "postcards" / "png"


def load_base_url() -> str:
    with (ROOT / "config" / "branding.json").open(encoding="utf-8") as fh:
        return json.load(fh)["github_pages_base"].rstrip("/")


def check_url(url: str) -> tuple[str, int | str]:
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=25) as resp:
            return url, resp.status
    except urllib.error.HTTPError as exc:
        return url, exc.code
    except Exception as exc:  # noqa: BLE001
        return url, str(exc)[:60]


def main() -> None:
    rows = list(csv.DictReader(CSV_PATH.open(newline="", encoding="utf-8")))
    base_url = load_base_url()

    missing_local: list[str] = []
    for row in rows:
        slug = row["slug"]
        if not (PNG_DIR / f"{slug}-landscape.png").exists():
            missing_local.append(slug)

    if missing_local:
        print(f"FAIL: {len(missing_local)} missing local PNG(s)")
        for slug in missing_local[:10]:
            print(f"  - {slug}")
        sys.exit(1)

    print(f"OK: {len(rows)} local PNGs present")

    urls = [f"{base_url}/postcards/png/{row['slug']}-landscape.png" for row in rows]
    bad: list[tuple[str, int | str]] = []
    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = {pool.submit(check_url, url): url for url in urls}
        for future in as_completed(futures):
            url, status = future.result()
            if status != 200:
                bad.append((url, status))

    if bad:
        print(f"FAIL: {len(bad)} URL(s) not HTTP 200 on GitHub Pages")
        for url, status in bad[:10]:
            print(f"  - {status} {url}")
        sys.exit(1)

    print(f"OK: all {len(rows)} Front_URLs return HTTP 200")
    print(f"Gallery: {base_url}/postcards/")


if __name__ == "__main__":
    main()
