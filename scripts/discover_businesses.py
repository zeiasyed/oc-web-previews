"""
Discover Orange County businesses without websites.

Primary: OpenStreetMap Overpass (free, single combined query)
Fallback: Nominatim search (free)
Last resort: data/pilot-seed.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
from pathlib import Path

import requests

from check_website import qualifies_as_no_website

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

OC_BBOX = (33.43, -118.01, 33.94, -117.42)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

CHAIN_KEYWORDS = {
    "pep boys", "h&r block", "walmart", "mcdonald", "starbucks", "jiffy lube",
    "valvoline", "autozone", "oreilly", "napa auto", "goodyear", "firestone",
    "bank of america", "wells fargo", "chase", "7-eleven", "target", "costco",
    "student union", "titan student",
}

WRONG_INDUSTRY_KEYWORDS = {
    "bagel", "brew", "coffee", "pizza", "restaurant", "grill", "cafe", "bakery",
}


def is_chain(name: str) -> bool:
    lower = name.lower()
    return any(k in lower for k in CHAIN_KEYWORDS)


def has_street_address(tags: dict) -> bool:
    if tags.get("addr:housenumber"):
        return True
    street = tags.get("addr:street") or ""
    return bool(re.search(r"\d", street))


def score_candidate(row: dict) -> int:
    score = 0
    name = row["name"].lower()
    if is_chain(name):
        return -100
    if any(k in name.lower() for k in WRONG_INDUSTRY_KEYWORDS):
        return -50
    if not in_orange_county(row.get("city", ""), row.get("address", "")):
        return -100
    if re.search(r"\d", row.get("address", "")):
        score += 3
    if row.get("phone"):
        score += 2
    if row["industry"] in {"home_services", "auto", "professional"}:
        score += 1
    if row.get("no_website_reason") == "no_website_listed":
        score += 4
    elif row.get("no_website_reason") == "social_or_directory_only":
        score += 3
    if row.get("source") == "openstreetmap":
        score += 1
    return score


NOMINATIM_QUERIES = [
    ("home_services", "plumber Orange County California"),
    ("home_services", "HVAC contractor Orange County California"),
    ("home_services", "electrician Orange County California"),
    ("auto", "auto repair shop Orange County California"),
    ("auto", "car detailing Orange County California"),
    ("professional", "accountant Orange County California"),
    ("professional", "tax preparer Orange County California"),
    ("professional", "law office Orange County California"),
]


def slugify(name: str, city: str = "") -> str:
    base = f"{name}-{city}".lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    return base[:60] or "business"


OC_CITY_KEYWORDS = {
    "anaheim", "irvine", "santa ana", "huntington beach", "orange", "fullerton",
    "costa mesa", "mission viejo", "westminster", "newport beach", "buena park",
    "lake forest", "tustin", "yorba linda", "san clemente", "laguna niguel",
    "la habra", "fountain valley", "placentia", "rancho santa margarita",
    "aliso viejo", "cypress", "brea", "stanton", "san juan capistrano", "dana point",
    "seal beach", "laguna hills", "laguna beach", "garden grove", "los alamitos",
    "villa park", "la palma", "midway city", "foothill ranch", "ladera ranch",
    "silverado", "sunset beach", "coto de caza", "trabuco canyon",
}


def in_orange_county(city: str, address: str) -> bool:
    blob = f"{city} {address}".lower()
    return any(k in blob for k in OC_CITY_KEYWORDS)


def infer_industry(tags: dict, default: str, name: str = "") -> str:
    text = (json.dumps(tags) + " " + name).lower()
    if any(k in text for k in ("beer", "brewery", "restaurant", "bagel", "cafe", "pizza")):
        return "exclude"
    if any(k in text for k in ("car_repair", "car_wash", "auto", "garage", "collision", "tire", "muffler")):
        return "auto"
    if any(k in text for k in ("lawyer", "accountant", "tax", "office", "insurance", "counsel")):
        return "professional"
    if any(k in text for k in ("plumber", "hvac", "electrician", "trade", "craft", "comfort", "heating")):
        return "home_services"
    return default


def row_from_tags(name: str, tags: dict, industry: str, source: str) -> dict | None:
    if not name or len(name) < 3:
        return None
    if is_chain(name):
        return None
    if any(k in name.lower() for k in WRONG_INDUSTRY_KEYWORDS):
        return None
    if source == "openstreetmap" and not has_street_address(tags):
        return None

    website = tags.get("website") or tags.get("contact:website") or tags.get("url") or ""
    qualifies, reason = qualifies_as_no_website(website)
    if not qualifies:
        return None

    city = tags.get("addr:city") or tags.get("addr:suburb") or "Orange County"
    address_parts = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        city,
        tags.get("addr:state") or "CA",
        tags.get("addr:postcode"),
    ]
    address = ", ".join(p for p in address_parts if p) or f"{city}, CA"

    if not in_orange_county(city, address):
        return None

    industry = infer_industry(tags, industry, name)
    if industry == "exclude":
        return None

    return {
        "name": name,
        "slug": slugify(name, city),
        "industry": industry,
        "address": address,
        "city": city,
        "phone": tags.get("phone") or tags.get("contact:phone") or "",
        "website_listed": website,
        "no_website_reason": reason,
        "source": source,
        "status": "pending",
    }


def overpass_combined() -> list[dict]:
    south, west, north, east = OC_BBOX
    query = f"""
    [out:json][timeout:45];
    (
      node["name"]["shop"="car_repair"]({south},{west},{north},{east});
      node["name"]["craft"]({south},{west},{north},{east});
      node["name"]["office"]({south},{west},{north},{east});
      node["name"]["shop"="trade"]({south},{west},{north},{east});
    );
    out tags 400;
    """
    response = requests.post(
        OVERPASS_URL,
        data={"data": query},
        timeout=60,
        headers={"User-Agent": "OCWebCoDiscovery/1.0"},
    )
    response.raise_for_status()
    elements = response.json().get("elements", [])

    rows: list[dict] = []
    seen: set[str] = set()
    for el in elements:
        tags = el.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        row = row_from_tags(name, tags, "home_services", "openstreetmap")
        if row:
            rows.append(row)
    return rows


def nominatim_search() -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()

    for industry, query in NOMINATIM_QUERIES:
        print(f"Nominatim: {query}")
        try:
            response = requests.get(
                NOMINATIM_URL,
                params={"q": query, "format": "jsonv2", "limit": 15, "countrycodes": "us"},
                timeout=30,
                headers={"User-Agent": "OCWebCoDiscovery/1.0 (contact: hello@ocwebco.example)"},
            )
            response.raise_for_status()
            results = response.json()
        except requests.RequestException as exc:
            print(f"  Nominatim error: {exc}")
            continue

        for item in results:
            name = item.get("name") or item.get("display_name", "").split(",")[0]
            if not name or name.lower() in seen:
                continue

            display = item.get("display_name", "")
            if "orange" not in display.lower() and "california" not in display.lower():
                continue

            seen.add(name.lower())
            tags = {
                "addr:city": next((p.strip() for p in display.split(",") if "CA" in display), "Orange County"),
            }
            row = row_from_tags(name, tags, industry, "nominatim")
            if row:
                row["address"] = display
                rows.append(row)

        time.sleep(1.1)

    return rows


def load_seed() -> list[dict]:
    seed_path = DATA_DIR / "pilot-seed.csv"
    if not seed_path.exists():
        return []
    with seed_path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def discover(pool_size: int = 100) -> list[dict]:
    cache_path = DATA_DIR / "discovered_raw.json"
    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if cached:
            return cached[:pool_size]

    rows: list[dict] = []
    used_slugs: set[str] = set()

    def add_rows(new_rows: list[dict]) -> None:
        nonlocal rows
        for row in new_rows:
            if row["slug"] in used_slugs:
                row["slug"] = f"{row['slug']}-{len(used_slugs)}"
            used_slugs.add(row["slug"])
            rows.append(row)

    try:
        print("Trying OpenStreetMap Overpass (fast query)...")
        add_rows(overpass_combined())
        print(f"  Overpass returned {len(rows)} candidates")
    except requests.RequestException as exc:
        print(f"  Overpass failed: {exc}")

    if len(rows) < pool_size:
        add_rows(nominatim_search())
        print(f"  Total after Nominatim: {len(rows)}")

    if len(rows) < pool_size:
        add_rows(load_seed())
        print(f"  Total after seed file: {len(rows)}")

    rows = dedupe_by_name(rows)
    rows = [r for r in rows if score_candidate(r) >= 0]
    rows.sort(key=score_candidate, reverse=True)
    rows = rows[:pool_size]

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return rows[:pool_size]


def dedupe_by_name(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for row in rows:
        key = row["name"].lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def write_csv(rows: list[dict], path: Path) -> None:
    fieldnames = [
        "name", "slug", "industry", "address", "city", "phone",
        "website_listed", "no_website_reason", "source", "status",
        "verification_status", "verification_notes", "google_maps_url",
        "google_website", "google_phone", "google_address",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            row.setdefault("status", "pending")
            row.setdefault("verification_status", "unverified")
            row.setdefault("verification_notes", "")
            row.setdefault("google_maps_url", "")
            row.setdefault("google_website", "")
            row.setdefault("google_phone", "")
            row.setdefault("google_address", "")
            writer.writerow(row)


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover OC businesses without websites")
    parser.add_argument("--limit", type=int, default=10, help="Businesses to write to pilot CSV")
    parser.add_argument("--pool-size", type=int, default=100, help="Raw discovery pool size")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()

    cache_path = DATA_DIR / "discovered_raw.json"
    if args.refresh and cache_path.exists():
        cache_path.unlink()

    rows = discover(pool_size=args.pool_size)
    write_csv(rows[: args.limit], DATA_DIR / "pilot-10.csv")
    write_csv(rows, DATA_DIR / "businesses.csv")
    print(f"Discovered {len(rows)} candidates, wrote top {min(len(rows), args.limit)} to data/pilot-10.csv")


if __name__ == "__main__":
    main()
