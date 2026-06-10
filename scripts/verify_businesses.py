"""
Cross-check businesses before outreach.

Free checks (always):
  - Re-probe any listed website URL
  - Google Maps search link for manual review
  - Nominatim name/address cross-check (OpenStreetMap)

Optional (if config/google.json or GOOGLE_PLACES_API_KEY is set):
  - Google Places Text Search for website, phone, address

Updates the CSV with verification_status:
  approved              — safe to use (no live website found)
  rejected_has_website  — live website found; excluded from generation
  needs_manual_review   — conflict or missing data; check google_maps_url
"""

from __future__ import annotations

import argparse
import csv
import re
import time
from pathlib import Path

import requests

from check_website import is_social_or_directory, qualifies_as_no_website, website_is_live
from google_places import google_maps_search_url, load_api_key, search_place

ROOT = Path(__file__).resolve().parents[1]
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

FIELDNAMES = [
    "name",
    "slug",
    "industry",
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
    "google_website",
    "google_phone",
    "google_address",
]


def normalize_phone(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def phones_match(a: str, b: str) -> bool:
    da, db = normalize_phone(a), normalize_phone(b)
    if not da or not db:
        return True
    return da.endswith(db[-10:]) or db.endswith(da[-10:])


def nominatim_lookup(name: str, city: str) -> dict | None:
    try:
        response = requests.get(
            NOMINATIM_URL,
            params={
                "q": f"{name}, {city}, Orange County, California",
                "format": "jsonv2",
                "limit": 1,
                "countrycodes": "us",
            },
            timeout=20,
            headers={"User-Agent": "OCWebCoVerification/1.0 (contact: hello@ocwebco.example)"},
        )
        response.raise_for_status()
        results = response.json()
    except requests.RequestException:
        return None

    if not results:
        return None

    item = results[0]
    extratags = item.get("extratags") or {}
    return {
        "nominatim_display": item.get("display_name") or "",
        "nominatim_website": extratags.get("website") or item.get("website") or "",
    }


def verify_row(row: dict, use_google_api: bool) -> dict:
    notes: list[str] = []
    name = row.get("name", "")
    city = row.get("city", "")
    address = row.get("address", "")

    row["google_maps_url"] = google_maps_search_url(name, address, city)
    row.setdefault("google_website", "")
    row.setdefault("google_phone", "")
    row.setdefault("google_address", "")

    urls_to_check = []
    if row.get("website_listed"):
        urls_to_check.append(("osm", row["website_listed"]))

    nominatim = nominatim_lookup(name, city)
    time.sleep(1.1)

    if nominatim:
        if nominatim.get("nominatim_website"):
            urls_to_check.append(("nominatim", nominatim["nominatim_website"]))
            notes.append("Nominatim lists a website URL")
        else:
            notes.append("Nominatim: no website found")

    if use_google_api:
        try:
            place = search_place(name, city, address)
        except requests.RequestException as exc:
            place = None
            notes.append(f"Google Places error: {exc}")

        if place:
            row["google_website"] = place.get("google_website") or ""
            row["google_phone"] = place.get("google_phone") or ""
            row["google_address"] = place.get("google_address") or ""
            if place.get("google_maps_url"):
                row["google_maps_url"] = place["google_maps_url"]

            if row["google_website"]:
                if is_social_or_directory(row["google_website"]):
                    notes.append(f"Google website is social/directory only: {row['google_website']}")
                else:
                    urls_to_check.append(("google", row["google_website"]))
                    notes.append(f"Google Places lists website: {row['google_website']}")
            else:
                notes.append("Google Places: no website listed")

            if row["google_phone"] and row.get("phone") and not phones_match(row["phone"], row["google_phone"]):
                notes.append(f"Phone mismatch OSM vs Google ({row['phone']} vs {row['google_phone']})")
        else:
            notes.append("Google Places: no matching listing found")
    else:
        notes.append("Google Places skipped — add config/google.json for auto-check")

    live_website = None
    for source, url in urls_to_check:
        if source == "google" and url and not is_social_or_directory(url):
            live_website = (source, url)
            break
        qualifies, reason = qualifies_as_no_website(url)
        if not qualifies or website_is_live(url):
            live_website = (source, url)
            break

    if live_website:
        source, url = live_website
        row["verification_status"] = "rejected_has_website"
        row["verification_notes"] = f"Live website found via {source}: {url}. " + "; ".join(notes)
        row["status"] = "rejected"
    elif any("mismatch" in n.lower() for n in notes):
        row["verification_status"] = "needs_manual_review"
        row["verification_notes"] = "; ".join(notes)
        row["status"] = "review"
    elif any("no matching listing" in n for n in notes) and use_google_api:
        row["verification_status"] = "needs_manual_review"
        row["verification_notes"] = "; ".join(notes)
        row["status"] = "review"
    elif use_google_api and not any("Google Places lists website" in n for n in notes):
        if any("no matching listing" in n for n in notes):
            row["verification_status"] = "needs_manual_review"
            row["verification_notes"] = "; ".join(notes)
            row["status"] = "review"
        elif any("Google Places: no website listed" in n for n in notes):
            row["verification_status"] = "approved"
            row["verification_notes"] = "; ".join(notes)
            row["status"] = "approved"
        else:
            row["verification_status"] = "approved"
            row["verification_notes"] = "; ".join(notes) if notes else "No live website found"
            row["status"] = "approved"
    else:
        row["verification_status"] = "approved"
        row["verification_notes"] = "; ".join(notes) if notes else "No live website found"
        row["status"] = "approved"

    return row


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def csv_fieldnames(rows: list[dict]) -> list[str]:
    names = list(FIELDNAMES)
    for row in rows:
        for key in row:
            if key not in names:
                names.append(key)
    return names


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=csv_fieldnames(rows), extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def safe_print_name(name: str) -> str:
    return (name or "").encode("ascii", "replace").decode("ascii")


def main() -> None:
    import sys

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Verify business list before outreach")
    parser.add_argument("--csv", default=str(ROOT / "data" / "pilot-10.csv"))
    parser.add_argument("--slug", help="Verify one business only")
    parser.add_argument("--no-google", action="store_true", help="Skip Google Places even if key exists")
    parser.add_argument("--require-google", action="store_true", help="Fail if Google API key is not configured")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    rows = read_csv(csv_path)
    if args.slug:
        rows = [r for r in rows if r.get("slug") == args.slug]

    has_key = load_api_key() is not None
    if args.require_google and not has_key:
        print("ERROR: Google Places API key required but not configured.")
        print("Run: python scripts/setup_google.py")
        print("Docs: docs/GOOGLE_PLACES_SETUP.md")
        raise SystemExit(1)

    use_google = not args.no_google and has_key
    if use_google:
        print("Google Places API: enabled")
    else:
        print("Google Places API: not configured (free checks only)")

    verified: list[dict] = []
    counts = {"approved": 0, "rejected_has_website": 0, "needs_manual_review": 0}

    for i, row in enumerate(rows):
        print(f"Verifying ({i + 1}/{len(rows)}): {safe_print_name(row.get('name', ''))}")
        row = verify_row(row, use_google)
        verified.append(row)
        counts[row["verification_status"]] = counts.get(row["verification_status"], 0) + 1
        print(f"  -> {row['verification_status']}: {row['verification_notes'][:80]}...")
        if use_google and i < len(rows) - 1:
            time.sleep(0.3)

    if args.slug:
        all_rows = read_csv(csv_path)
        slug = args.slug
        for i, r in enumerate(all_rows):
            if r.get("slug") == slug:
                all_rows[i] = verified[0]
                break
        write_csv(csv_path, all_rows)
    else:
        write_csv(csv_path, verified)

    report_path = ROOT / "data" / "verification-report.txt"
    report_lines = [
        f"Verified {len(verified)} businesses in {csv_path.name}",
        f"  approved:              {counts.get('approved', 0)}",
        f"  rejected_has_website:  {counts.get('rejected_has_website', 0)}",
        f"  needs_manual_review:   {counts.get('needs_manual_review', 0)}",
        "",
        "Manual review links:",
    ]
    for row in verified:
        if row["verification_status"] != "approved":
            report_lines.append(f"  {row['name']}: {row['google_maps_url']}")

    report_path.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"\nWrote {csv_path}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
