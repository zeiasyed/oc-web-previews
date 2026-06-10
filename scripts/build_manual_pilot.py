"""Build pilot-10.csv from manually verified no-website businesses."""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

VERIFIED_SLUGS = [
    "watch-tech-lake-forest",
    "pro-mufflers-brakes-midway-city",
    "reco-construction-westminster",
    "my-l-j-insurance-services-lake-forest",
    "r-nh-t-cali-garden-grove",
    "nu-trend-homes-costa-mesa",
    "quality-building-maintenance-inc-garden-grove",
    "gutierrez-nguyen-law-center-westminster",
    "karen-schipani-tedrahn-mft-fullerton",
    "rainbow-auto-center-garden-grove",
]

MANUAL_NOTES = {
    "watch-tech-lake-forest": "Manual verify: Facebook/Yelp/MapQuest only; no standalone domain",
    "pro-mufflers-brakes-midway-city": "Manual verify: promuffler.net / promufflersandbrakes.net dead; directories only",
    "reco-construction-westminster": "Manual verify: recoconstruction.com is Alberta Canada; OC location has no site",
    "my-l-j-insurance-services-lake-forest": "Manual verify: directories/LinkedIn only; no own domain",
    "r-nh-t-cali-garden-grove": "Manual verify: Google business.site only; no own domain",
    "nu-trend-homes-costa-mesa": "Manual verify: costamesadirect.us hosted profile only; no own domain",
    "quality-building-maintenance-inc-garden-grove": "Manual verify: gardengrovedirect.us profile; qualitybuildingmaintenanceinc.com not live",
    "gutierrez-nguyen-law-center-westminster": "Manual verify: no dedicated website found for this Westminster firm",
    "karen-schipani-tedrahn-mft-fullerton": "Manual verify: fullertondirect.us profile; heartcenteredcounseling.com not live",
    "rainbow-auto-center-garden-grove": "Manual verify: rainbowautocenter.com is Hayward CA; Garden Grove shop has no site",
}

FIELDNAMES = [
    "name", "slug", "industry", "address", "city", "phone",
    "website_listed", "no_website_reason", "source", "status",
    "verification_status", "verification_notes", "google_maps_url",
    "google_website", "google_phone", "google_address",
    "web_search_website", "web_search_confidence",
]


def main() -> None:
    import sys
    sys.path.insert(0, str(ROOT / "scripts"))
    from google_places import google_maps_search_url

    pool = {r["slug"]: r for r in json.loads((DATA / "discovered_raw.json").read_text(encoding="utf-8"))}

    rows = []
    missing = []
    for slug in VERIFIED_SLUGS:
        if slug not in pool:
            missing.append(slug)
            continue
        row = dict(pool[slug])
        row["status"] = "approved"
        row["verification_status"] = "approved"
        row["verification_notes"] = MANUAL_NOTES[slug]
        row["google_maps_url"] = google_maps_search_url(row["name"], row.get("address", ""), row.get("city", ""))
        row["web_search_website"] = ""
        row["web_search_confidence"] = "manual"
        rows.append(row)

    if missing:
        raise SystemExit(f"Missing from pool: {missing}")
    if len(rows) != 10:
        raise SystemExit(f"Expected 10 rows, got {len(rows)}")

    for path in (DATA / "pilot-10.csv", DATA / "businesses.csv"):
        with path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=FIELDNAMES, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)

    report = [
        "Manual verification — 10 businesses with no standalone website",
        "",
        "Approved businesses:",
    ]
    for r in rows:
        report.append(f"  - {r['name']} ({r['city']}) — {MANUAL_NOTES[r['slug']]}")
    (DATA / "verification-report.txt").write_text("\n".join(report), encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(report))


if __name__ == "__main__":
    main()
