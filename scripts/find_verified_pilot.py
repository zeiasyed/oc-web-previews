"""
Discover businesses and verify via free web search until N have no website.

Usage:
  python scripts/find_verified_pilot.py --count 10 --refresh
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SCRIPTS = ROOT / "scripts"

FIELDNAMES = [
    "name", "slug", "industry", "address", "city", "phone",
    "website_listed", "no_website_reason", "source", "status",
    "verification_status", "verification_notes", "google_maps_url",
    "google_website", "google_phone", "google_address",
    "web_search_website", "web_search_confidence",
]


def run_discover(pool_size: int, refresh: bool) -> None:
    cmd = [sys.executable, str(SCRIPTS / "discover_businesses.py"), "--pool-size", str(pool_size), "--limit", str(pool_size)]
    if refresh:
        cmd.append("--refresh")
    subprocess.run(cmd, cwd=ROOT, check=True)


def load_pool() -> list[dict]:
    path = DATA / "discovered_raw.json"
    if not path.exists():
        raise SystemExit("No discovery pool — run with --refresh")
    return json.loads(path.read_text(encoding="utf-8"))


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> None:
    parser = argparse.ArgumentParser(description="Find N verified no-website businesses")
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--pool-size", type=int, default=120)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--generate", action="store_true", help="Generate sites + postcards after")
    args = parser.parse_args()

    sys.path.insert(0, str(SCRIPTS))
    from check_websites_web import verify_row

    if args.refresh or not (DATA / "discovered_raw.json").exists():
        print(f"Discovering up to {args.pool_size} candidates...")
        run_discover(args.pool_size, refresh=True)
    else:
        print("Using existing discovery pool (pass --refresh to re-query OSM)")

    pool = load_pool()
    print(f"Pool size: {len(pool)} candidates")

    approved: list[dict] = []
    rejected: list[dict] = []
    review: list[dict] = []

    for i, row in enumerate(pool):
        if len(approved) >= args.count:
            break

        print(f"\nVerify ({i + 1}/{len(pool)}): {ascii(row['name'])}")
        row = verify_row(row)
        status = row["verification_status"]
        print(f"  -> {status}: {row.get('web_search_website') or 'no site found'}")

        if status == "approved":
            approved.append(row)
            print(f"  OK Approved ({len(approved)}/{args.count})")
        elif status == "needs_manual_review":
            review.append(row)
        else:
            rejected.append(row)

        time.sleep(1.2)

    write_csv(DATA / "pilot-10.csv", approved)
    write_csv(DATA / "businesses.csv", approved)
    write_csv(DATA / "rejected-pool.csv", rejected)
    write_csv(DATA / "review-pool.csv", review)

    report = [
        f"Target: {args.count} businesses with no website",
        f"Approved:  {len(approved)}",
        f"Rejected:  {len(rejected)} (website found)",
        f"Review:    {len(review)} (unclear — check manually)",
        "",
        "Approved businesses:",
    ]
    for r in approved:
        report.append(f"  - {r['name']} ({r['city']})")
    if len(approved) < args.count:
        report.append("")
        report.append(f"WARNING: Only found {len(approved)}/{args.count}. Run with --refresh --pool-size 200")

    (DATA / "verification-report.txt").write_text("\n".join(report), encoding="utf-8")
    print("\n" + "\n".join(report))

    if args.generate and approved:
        subprocess.run([sys.executable, str(SCRIPTS / "generate_site.py"), "--csv", str(DATA / "pilot-10.csv")], cwd=ROOT, check=True)
        subprocess.run([sys.executable, str(SCRIPTS / "sync_branding.py")], cwd=ROOT, check=True)
        subprocess.run([sys.executable, str(SCRIPTS / "generate_postcards.py")], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
