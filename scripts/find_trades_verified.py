"""
Verify trade businesses until N approved (plumbers first, then HVAC, then roofers).

Usage:
  python scripts/find_trades_verified.py --count 200 --refresh --google-only --require-google
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SCRIPTS = ROOT / "scripts"

FIELDNAMES = [
    "name", "slug", "industry", "trade", "region", "address", "city", "phone",
    "website_listed", "no_website_reason", "source", "status",
    "verification_status", "verification_notes", "google_maps_url",
    "google_website", "google_phone", "google_address",
    "web_search_website", "web_search_confidence",
]

TRADE_ORDER = ("plumber", "hvac", "roofer")


def has_street_number(address: str) -> bool:
    if not address:
        return False
    return bool(re.search(r"\b\d{1,6}\s+\w", address))


def is_city_only_address(address: str) -> bool:
    """Reject 'Anaheim, CA' style addresses with no street."""
    if has_street_number(address):
        return False
    parts = [p.strip() for p in address.split(",") if p.strip()]
    return len(parts) <= 2


def is_valid_approved(row: dict) -> bool:
    from discover_trades import GENERIC_NAME_PATTERNS, NON_SOCAL_CITIES, is_generic_name

    name = row.get("name", "")
    if is_generic_name(name):
        return False
    lower = name.lower()
    for bad in NON_SOCAL_CITIES:
        if bad in lower:
            return False
    if GENERIC_NAME_PATTERNS.search(name):
        return False

    address = row.get("address", "")
    source = row.get("source", "")

    if source in {"openstreetmap", "google_places"}:
        return has_street_number(address) or bool(row.get("phone", "").strip())

    if source in {"nominatim", "duckduckgo"}:
        if is_city_only_address(address):
            return False
        if not has_street_number(address) and not row.get("phone", "").strip():
            return False

    return True


def verify_trade_row_google(row: dict) -> dict:
    from check_website import is_social_or_directory, qualifies_as_no_website, website_is_live
    from google_places import google_maps_search_url, search_place

    name = row.get("name", "")
    city = row.get("city", "")
    address = row.get("address", "")
    notes: list[str] = []

    row.setdefault("google_maps_url", google_maps_search_url(name, address, city))
    row.setdefault("google_website", row.get("google_website") or "")
    row.setdefault("google_phone", row.get("google_phone") or "")
    row.setdefault("google_address", row.get("google_address") or "")

    urls_to_check: list[tuple[str, str]] = []
    if row.get("website_listed"):
        urls_to_check.append(("listed", row["website_listed"]))

    try:
        place = search_place(name, city, address)
    except Exception as exc:
        place = None
        notes.append(f"Google Places error: {exc}")

    if place:
        row["google_website"] = place.get("google_website") or row.get("google_website") or ""
        row["google_phone"] = place.get("google_phone") or row.get("google_phone") or ""
        row["google_address"] = place.get("google_address") or row.get("google_address") or ""
        if place.get("google_maps_url"):
            row["google_maps_url"] = place["google_maps_url"]
        if row["google_website"]:
            urls_to_check.append(("google", row["google_website"]))
            notes.append(f"Google lists website: {row['google_website']}")
        else:
            notes.append("Google Places: no website listed")
    else:
        notes.append("Google Places: no matching listing found")

    live_website = None
    for source, url in urls_to_check:
        if not url:
            continue
        if is_social_or_directory(url):
            notes.append(f"{source} URL is social/directory only: {url}")
            continue
        qualifies, _reason = qualifies_as_no_website(url)
        if not qualifies or website_is_live(url):
            live_website = (source, url)
            break

    if live_website:
        source, url = live_website
        row["web_search_website"] = url
        row["web_search_confidence"] = "high"
        row["verification_status"] = "rejected_has_website"
        row["verification_notes"] = f"Live website found via {source}: {url}. " + "; ".join(notes)
        row["status"] = "rejected"
    elif not place:
        row["web_search_website"] = ""
        row["web_search_confidence"] = "google"
        row["verification_status"] = "needs_manual_review"
        row["verification_notes"] = "; ".join(notes) + f"; Check Maps: {row['google_maps_url']}"
        row["status"] = "review"
    elif row.get("google_website") and is_social_or_directory(row["google_website"]):
        row["web_search_website"] = row["google_website"]
        row["web_search_confidence"] = "google"
        row["verification_status"] = "approved"
        row["verification_notes"] = "; ".join(notes)
        row["status"] = "approved"
    else:
        row["web_search_website"] = ""
        row["web_search_confidence"] = "google"
        row["verification_status"] = "approved"
        row["verification_notes"] = "; ".join(notes)
        row["status"] = "approved"

    return row


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=200)
    parser.add_argument("--out", default="trades-200.csv", help="Approved output CSV filename")
    parser.add_argument("--refresh", action="store_true", help="Re-query discovery sources")
    parser.add_argument("--skip-ddg", action="store_true", help="Skip DuckDuckGo discovery")
    parser.add_argument("--skip-verify", action="store_true", help="Skip website verification")
    parser.add_argument("--skip-nominatim", action="store_true", help="Skip slow Nominatim lookups")
    parser.add_argument("--google-discovery", action="store_true", help="Include Google Places discovery")
    parser.add_argument("--google-only", action="store_true", help="Google Places discovery only (recommended)")
    parser.add_argument("--require-google", action="store_true", help="Fail if Google API key missing")
    parser.add_argument("--no-google", action="store_true", help="Use free DDG verification instead of Google")
    args = parser.parse_args()

    sys.path.insert(0, str(SCRIPTS))
    from discover_trades import discover
    from google_places import load_api_key

    has_key = load_api_key() is not None
    if args.require_google and not has_key:
        print("ERROR: Google Places API key required but not configured.")
        print("Run: python scripts/setup_google.py")
        print("Docs: docs/GOOGLE_PLACES_SETUP.md")
        raise SystemExit(1)

    use_google_verify = has_key and not args.no_google and not args.skip_verify
    use_google_discovery = args.google_discovery or args.google_only

    if use_google_discovery and not has_key:
        print("ERROR: --google-discovery/--google-only requires a Google API key.")
        raise SystemExit(1)

    if use_google_verify:
        print("Verification: Google Places API")
    elif args.skip_verify:
        print("Verification: skipped")
    else:
        print("Verification: DuckDuckGo web search (free)")

    if use_google_discovery:
        mode = "Google Places only" if args.google_only else "Google Places + OSM/Nominatim"
        print(f"Discovery: {mode}")

    pool = discover(
        refresh=args.refresh,
        skip_ddg=args.skip_ddg or args.google_only,
        skip_nominatim=args.skip_nominatim or args.google_only,
        google_discovery=use_google_discovery,
        google_only=args.google_only,
    )
    print(f"Pool: {len(pool)} trade candidates")

    approved: list[dict] = []
    rejected: list[dict] = []
    review: list[dict] = []
    used_slugs: set[str] = set()

    def try_verify(row: dict) -> None:
        if row["slug"] in used_slugs:
            return
        if args.skip_verify:
            row["verification_status"] = "approved"
            row["verification_notes"] = "Verification skipped"
            row["status"] = "approved"
            row["web_search_website"] = ""
            row["web_search_confidence"] = "skipped"
        elif use_google_verify:
            verify_trade_row_google(row)
        else:
            from check_websites_web import verify_row
            verify_row(row)

        used_slugs.add(row["slug"])
        status = row["verification_status"]
        if status == "approved" and is_valid_approved(row):
            row.setdefault("region", "socal")
            approved.append(row)
        elif status == "approved":
            row["verification_status"] = "rejected_bad_record"
            row["verification_notes"] = (row.get("verification_notes") or "") + "; Rejected: weak address or generic name"
            rejected.append(row)
        elif status == "needs_manual_review":
            review.append(row)
        else:
            rejected.append(row)

    ordered_pool = sorted(
        pool,
        key=lambda r: (
            TRADE_ORDER.index(r["trade"]) if r.get("trade") in TRADE_ORDER else 9,
            0 if r.get("source") == "google_places" else 1,
            0 if has_street_number(r.get("address", "")) else 1,
            r.get("name", ""),
        ),
    )

    verify_delay = 0.2 if use_google_verify else 0.85

    for i, row in enumerate(ordered_pool):
        if len(approved) >= args.count:
            break
        label = row["name"].encode("ascii", "replace").decode("ascii")
        print(f"({i + 1}/{len(ordered_pool)}) [{row.get('trade')}] {label}...")
        try_verify(dict(row))
        if approved and approved[-1]["slug"] == row["slug"]:
            print(f"  OK ({len(approved)}/{args.count})")
        elif not args.skip_verify:
            print("  skipped")
        if not args.skip_verify:
            time.sleep(verify_delay)

    out_path = DATA / args.out
    write_csv(out_path, approved)
    write_csv(DATA / "trades-rejected.csv", rejected)
    write_csv(DATA / "trades-review.csv", review)
    if args.out == "trades-200.csv":
        write_csv(DATA / "trades-50.csv", approved)

    counts = {}
    for r in approved:
        counts[r["trade"]] = counts.get(r["trade"], 0) + 1

    report = [
        f"Target: {args.count} trade businesses with no website",
        f"Approved: {len(approved)} -> {out_path.name}",
        f"  plumber: {counts.get('plumber', 0)}",
        f"  hvac: {counts.get('hvac', 0)}",
        f"  roofer: {counts.get('roofer', 0)}",
        f"Rejected: {len(rejected)}",
        f"Review: {len(review)}",
        f"Pool size was: {len(pool)}",
        "",
        "Approved:",
    ]
    for r in approved:
        report.append(f"  [{r['trade']}] {r['name']} — {r['city']}")

    if len(approved) < args.count:
        report.append("")
        report.append(f"WARNING: Only {len(approved)}/{args.count}. Re-run with --refresh or broaden pool.")

    (DATA / "trades-verification-report.txt").write_text("\n".join(report), encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print("\n" + "\n".join(report))


if __name__ == "__main__":
    main()
