"""
Run the full Solena Digital pipeline in one shot.

Usage:
  python scripts/run_all.py                  # full pilot (discover + all sites + postcards)
  python scripts/run_all.py --sample-only    # discover + 1 sample site + 1 postcard
  python scripts/run_all.py --skip-discover  # reuse data/pilot-10.csv
  python scripts/run_all.py --scale 300      # after pilot approval
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"


def run_step(label: str, args: list[str]) -> None:
    cmd = [sys.executable, str(SCRIPTS / args[0]), *args[1:]]
    print(f"\n{'=' * 60}\n>> {label}\n{'=' * 60}")
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        raise SystemExit(f"Step failed: {label} (exit {result.returncode})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run full Solena Digital pipeline")
    parser.add_argument("--limit", type=int, default=10, help="Business count")
    parser.add_argument("--sample-only", action="store_true", help="Generate only the top-ranked sample")
    parser.add_argument("--skip-discover", action="store_true", help="Skip discovery; use existing CSV")
    parser.add_argument("--skip-verify", action="store_true", help="Skip verification step")
    parser.add_argument("--verify-only", action="store_true", help="Only run verification on existing CSV")
    parser.add_argument("--refresh", action="store_true", help="Force re-query OpenStreetMap")
    parser.add_argument("--scale", type=int, help="Scale mode: discover N businesses")
    args = parser.parse_args()

    limit = args.scale or args.limit

    csv_path = ROOT / "data" / ("businesses.csv" if args.scale else "pilot-10.csv")

    if args.verify_only:
        run_step("Verify websites (free web search)", [
            "check_websites_web.py", "--csv", str(csv_path),
        ])
        return

    if not args.skip_discover:
        discover_args = ["discover_businesses.py", "--limit", str(limit)]
        if args.refresh:
            discover_args.append("--refresh")
        run_step(f"Discover {limit} businesses (free OpenStreetMap)", discover_args)

    if (not args.skip_discover or (args.skip_discover and not args.skip_verify)) and not args.skip_verify:
        run_step("Verify websites (free web search)", [
            "check_websites_web.py", "--csv", str(csv_path),
        ])

    if args.sample_only:
        import csv

        with csv_path.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        if not rows:
            raise SystemExit("No businesses in CSV — run discovery first.")
        slug = rows[0]["slug"]
        run_step(f"Generate sample site ({slug})", ["generate_site.py", "--slug", slug])
    else:
        run_step(f"Generate all sites from {csv_path.name}", ["generate_site.py", "--csv", str(csv_path)])

    run_step("Sync branding to landing page", ["sync_branding.py"])

    if args.sample_only:
        import csv

        with csv_path.open(newline="", encoding="utf-8") as fh:
            slug = list(csv.DictReader(fh))[0]["slug"]
        run_step("Generate sample postcard", ["generate_postcards.py", "--slug", slug])
    else:
        run_step("Generate all postcards", ["generate_postcards.py", "--csv", str(csv_path)])

    print(f"\n{'=' * 60}")
    print("DONE — all steps finished.")
    print(f"  CSV:       data/{csv_path.name}")
    print(f"  Previews:  previews/")
    print(f"  Postcards: postcards/png/")
    print(f"  Landing:   landing/connect.html?biz=SLUG")
    print(f"  Deploy:    see docs/DEPLOY.md")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
