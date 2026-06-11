"""Build a pipeline-ready CSV from TX plumber discovery data."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
LANDING_DATA = ROOT / "landing" / "data"

PIPELINE_FIELDS = [
    "name",
    "slug",
    "industry",
    "trade",
    "address",
    "city",
    "phone",
    "website_listed",
    "no_website_reason",
    "source",
    "status",
    "verification_status",
    "verification_notes",
    "google_maps_url",
    "region",
]

DEFAULT_SOURCES = [
    LANDING_DATA / "tx-plumbers-100-no-website-new.csv",
    LANDING_DATA / "tx-plumbers-google.csv",
]


def is_no_website(row: dict) -> bool:
    if str(row.get("has_website", "")).lower() == "true":
        return False
    category = (row.get("website_category") or "").lower()
    return category in ("no_website", "website_url_not_reachable", "social_or_directory_only", "")


def to_pipeline_row(row: dict) -> dict:
    return {
        "name": row.get("company_name") or row.get("name") or "",
        "slug": row["slug"],
        "industry": "home_services",
        "trade": "plumber",
        "address": row.get("address") or row.get("full_address") or "",
        "city": row.get("city") or "",
        "phone": row.get("phone") or row.get("recommended_phone") or "",
        "website_listed": row.get("website") or row.get("website_listed") or "",
        "no_website_reason": row.get("website_category") or "no_website",
        "source": row.get("source") or "google_places_tx",
        "status": "approved",
        "verification_status": "approved",
        "verification_notes": (
            f"TX batch — {row.get('website_category') or 'no_website'} "
            f"({row.get('discovery_city') or row.get('city') or 'Texas'})"
        ),
        "google_maps_url": row.get("google_maps_url") or "",
        "region": "texas",
    }


def load_candidates(source_paths: list[Path]) -> list[dict]:
    seen: set[str] = set()
    candidates: list[dict] = []
    for path in source_paths:
        if not path.exists():
            continue
        with path.open(newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                slug = (row.get("slug") or "").strip()
                if not slug or slug in seen:
                    continue
                if not is_no_website(row):
                    continue
                if not row.get("phone") or not row.get("address") or not row.get("city"):
                    continue
                if row.get("business_status") not in (None, "", "OPERATIONAL"):
                    continue
                seen.add(slug)
                candidates.append(row)
    return candidates


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare TX plumber batch CSV for site/postcard generation")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--out", default=str(DATA / "tx-plumbers-50.csv"))
    parser.add_argument(
        "--source",
        action="append",
        help="Source CSV (repeatable). Defaults to curated no-website lists.",
    )
    args = parser.parse_args()

    sources = [Path(p) for p in args.source] if args.source else DEFAULT_SOURCES
    candidates = load_candidates(sources)
    candidates.sort(key=lambda r: (r.get("city") or "", r.get("company_name") or r.get("name") or ""))
    selected = candidates[: args.limit]
    if len(selected) < args.limit:
        raise SystemExit(f"Only found {len(selected)} eligible TX plumbers (wanted {args.limit}).")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pipeline_rows = [to_pipeline_row(r) for r in selected]
    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=PIPELINE_FIELDS)
        writer.writeheader()
        writer.writerows(pipeline_rows)

    print(f"Wrote {out_path.relative_to(ROOT)} ({len(pipeline_rows)} plumbers)")
    for row in pipeline_rows[:5]:
        print(f"  - {row['name']} ({row['city']}, TX)")
    if len(pipeline_rows) > 5:
        print(f"  ... and {len(pipeline_rows) - 5} more")


if __name__ == "__main__":
    main()
