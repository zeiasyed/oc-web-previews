"""
Discover Southern California plumbers, HVAC, and roofers without websites.

Usage:
  python scripts/discover_trades.py --refresh
  python scripts/discover_trades.py --refresh --skip-ddg
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
from discover_businesses import (
    CHAIN_KEYWORDS,
    OVERPASS_URL,
    dedupe_by_name,
    has_street_address,
    is_chain,
    slugify,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

# SoCal + Central Coast south + desert metros (expanded radius)
SOCAL_BBOX = (31.45, -121.25, 36.25, -114.10)

SOCAL_CITY_KEYWORDS = {
    # Orange County
    "anaheim", "irvine", "santa ana", "huntington beach", "orange", "fullerton",
    "costa mesa", "mission viejo", "westminster", "newport beach", "buena park",
    "lake forest", "tustin", "yorba linda", "san clemente", "laguna niguel",
    "la habra", "fountain valley", "placentia", "rancho santa margarita",
    "aliso viejo", "cypress", "brea", "stanton", "san juan capistrano", "dana point",
    "seal beach", "laguna hills", "laguna beach", "garden grove", "los alamitos",
    "villa park", "la palma", "midway city", "foothill ranch", "ladera ranch",
    # Los Angeles County
    "los angeles", "long beach", "glendale", "santa clarita", "pomona", "torrance",
    "pasadena", "el monte", "downey", "inglewood", "west covina", "norwalk",
    "burbank", "compton", "carson", "hawthorne", "whittier", "alhambra",
    "lakewood", "bellflower", "montebello", "pico rivera", "monterey park",
    "south gate", "santa monica", "culver city", "redondo beach", "manhattan beach",
    "hermosa beach", "gardena", "lawndale", "paramount", "cerritos", "artesia",
    "la mirada", "baldwin park", "covina", "diamond bar", "walnut", "rowland heights",
    "hacienda heights", "la puente", "arcadia", "monrovia", "azusa", "claremont",
    "la verne", "san dimas", "glendora", "covina", "west hollywood", "beverly hills",
    # Riverside / San Bernardino (Inland Empire)
    "riverside", "corona", "moreno valley", "murrieta", "temecula", "hemet",
    "perris", "lake elsinore", "menifee", "eastvale", "jurupa valley", "indio",
    "palm desert", "palm springs", "cathedral city", "san bernardino", "fontana",
    "rancho cucamonga", "ontario", "victorville", "rialto", "hesperia", "chino",
    "chino hills", "upland", "redlands", "highland", "colton", "loma linda",
    "yucaipa", "beaumont", "banning",
    # San Diego County
    "san diego", "chula vista", "escondido", "carlsbad", "el cajon", "vista",
    "san marcos", "encinitas", "national city", "la mesa", "poway", "santee",
    "oceanside", "vista",     "fallbrook", "ramona", "el centro", "calexico", "brawley",
    # Ventura / Santa Barbara / Central Coast (south)
    "oxnard", "thousand oaks", "simi valley", "ventura", "camarillo", "moorpark",
    "santa barbara", "goleta", "carpinteria", "lompoc", "santa maria", "san luis obispo",
    "paso robles", "atascadero",
    # High desert / Antelope Valley
    "lancaster", "palmdale", "apple valley", "hesperia", "victorville", "barstow",
    "ridgecrest", "tehachapi",
    # Imperial / Coachella
    "el centro", "imperial", "brawley", "coachella", "la quinta", "indian wells",
}

# Cities to query (Nominatim + DDG) — spread across expanded SoCal
SEARCH_CITIES = [
    # OC
    "anaheim", "irvine", "santa ana", "huntington beach", "garden grove", "orange",
    "fullerton", "costa mesa", "mission viejo", "westminster", "newport beach",
    "lake forest", "tustin", "buena park", "la habra", "brea", "san clemente",
    "yorba linda", "placentia", "cypress", "fountain valley", "aliso viejo",
    "rancho santa margarita", "laguna niguel", "dana point", "san juan capistrano",
    # LA
    "los angeles", "long beach", "glendale", "torrance", "pasadena", "downey",
    "norwalk", "whittier", "carson", "hawthorne", "lakewood", "bellflower",
    "alhambra", "pomona", "west covina", "el monte", "montebello", "redondo beach",
    "burbank", "inglewood", "compton", "south gate", "pico rivera", "santa monica",
    "culver city", "manhattan beach", "gardena", "lawndale", "cerritos", "la mirada",
    "baldwin park", "covina", "diamond bar", "walnut", "rowland heights", "arcadia",
    "monrovia", "claremont", "glendora", "san dimas", "la puente", "hacienda heights",
    "santa clarita", "palmdale", "lancaster",
    # IE
    "riverside", "corona", "moreno valley", "murrieta", "temecula", "san bernardino",
    "fontana", "rancho cucamonga", "ontario", "redlands", "chino", "upland",
    "hemet", "perris", "lake elsinore", "menifee", "eastvale", "jurupa valley",
    "victorville", "hesperia", "apple valley", "highland", "colton", "yucaipa",
    "beaumont", "banning", "indio", "palm desert", "palm springs", "cathedral city",
    # San Diego
    "san diego", "chula vista", "escondido", "oceanside", "carlsbad", "el cajon",
    "vista", "san marcos", "encinitas", "la mesa", "poway", "santee", "national city",
    "fallbrook", "ramona", "el centro",
    # Ventura / Central Coast
    "oxnard", "thousand oaks", "simi valley", "ventura", "camarillo", "santa barbara",
    "goleta", "santa maria", "san luis obispo",
]

TRADE_SEARCH_LABEL = {
    "plumber": "plumber",
    "hvac": "HVAC contractor",
    "roofer": "roofing contractor",
}

TRADE_CHAIN_KEYWORDS = {
    *CHAIN_KEYWORDS,
    "roto-rooter", "roto rooter", "mr. rooter", "mr rooter", "benjamin franklin",
    "service champions", "ars rescue", "rescue rooter", "rooter hero", "rooter heroes",
    "horizon services", "michael & son", "one hour heating", "one hour air",
    "home depot", "lowe's", "lowes", "sears", "carrier enterprise", "lennox",
    "servpro", "belfor", "stanley steemer", "comfort heroes", "goettl", "mike diamond",
    "barker and sons", "cali's choice", "pristine plumbing", "bluefrog",
}

PLUMBER_KEYWORDS = {"plumb", "drain", "sewer", "rooter", "pipe", "water heater", "leak"}
HVAC_KEYWORDS = {"hvac", "heating", "cooling", "air condition", "a/c", " ac ", "furnace", "heat pump"}
ROOFER_KEYWORDS = {"roof", "roofing", "shingle", "gutter", "skylight"}

EXCLUDE_NAME_KEYWORDS = {
    "supply", "wholesale", "distribution", "distributor", "manufacturer",
    "school", "college", "university", "training", "association",
    "el pollo", "mcdonald", "pizza", "restaurant", "grill", "taco",
}

# Reject generic directory-style titles
GENERIC_NAME_PATTERNS = re.compile(
    r"(plumbers?|hvac|heating|roofers?|roofing)\s+(in|near|around)\s+|"
    r"^\d+\s+best\s+|^top\s+\d+|^best\s+|directory|near me",
    re.I,
)

# CA cities outside SoCal search radius — reject DDG false positives
NON_SOCAL_CITIES = {
    "oakdale", "modesto", "stockton", "fresno", "bakersfield", "sacramento",
    "san jose", "oakland", "san francisco", "fremont", "visalia", "merced",
    "salinas", "monterey", "santa barbara", "santa maria", "eagle mountain",
    "norwalk ct", "dallas", "houston", "phoenix", "las vegas",
}


def load_excluded() -> set[str]:
    names: set[str] = set()
    slugs: set[str] = set()
    for path in (DATA / "pilot-10.csv", DATA / "businesses.csv", DATA / "trades-50.csv", DATA / "trades-200.csv"):
        if not path.exists():
            continue
        with path.open(newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                names.add(row["name"].lower().strip())
                slugs.add(row["slug"].lower().strip())
    return names | slugs


def in_socal(city: str, address: str) -> bool:
    blob = f"{city} {address}".lower()
    if any(bad in blob for bad in NON_SOCAL_CITIES):
        return False
    return any(k in blob for k in SOCAL_CITY_KEYWORDS) or ", ca" in blob or "california" in blob


def is_trade_chain(name: str) -> bool:
    lower = name.lower()
    return any(k in lower for k in TRADE_CHAIN_KEYWORDS)


def is_generic_name(name: str) -> bool:
    if GENERIC_NAME_PATTERNS.search(name):
        return True
    lower = name.lower()
    for bad_city in NON_SOCAL_CITIES:
        if bad_city in lower:
            return True
    return False


def classify_trade(name: str, tags: dict) -> str | None:
    text = f"{name} {json.dumps(tags)}".lower()
    if any(k in text for k in EXCLUDE_NAME_KEYWORDS):
        return None

    is_plumber = any(k in text for k in PLUMBER_KEYWORDS) or tags.get("craft") == "plumber"
    is_hvac = any(k in text for k in HVAC_KEYWORDS) or tags.get("craft") in {"hvac", "heating_engineer"}
    is_roofer = any(k in text for k in ROOFER_KEYWORDS) or tags.get("craft") == "roofer"

    if is_plumber and not is_hvac and not is_roofer:
        return "plumber"
    if is_hvac and not is_roofer:
        return "hvac"
    if is_roofer and not is_plumber:
        return "roofer"
    if is_plumber:
        return "plumber"
    if is_hvac:
        return "hvac"
    if is_roofer:
        return "roofer"
    return None


def row_from_element(
    name: str, tags: dict, trade: str, excluded: set[str], source: str = "openstreetmap",
) -> dict | None:
    if not name or len(name) < 3 or is_generic_name(name):
        return None
    if is_chain(name) or is_trade_chain(name):
        return None
    if name.lower() in excluded:
        return None
    if source == "openstreetmap" and not has_street_address(tags):
        if not tags.get("addr:full") and not (tags.get("phone") or tags.get("contact:phone")):
            return None

    website = tags.get("website") or tags.get("contact:website") or tags.get("url") or ""
    qualifies, reason = qualifies_as_no_website(website)
    if source == "openstreetmap" and not qualifies:
        return None

    city = tags.get("addr:city") or tags.get("addr:suburb") or ""
    address_parts = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        city,
        tags.get("addr:state") or "CA",
        tags.get("addr:postcode"),
    ]
    address = ", ".join(p for p in address_parts if p) or f"{city}, CA"
    if not in_socal(city, address):
        return None

    slug = slugify(name, city or "socal")
    if slug in excluded:
        return None

    return {
        "name": name,
        "slug": slug,
        "industry": "home_services",
        "trade": trade,
        "region": "socal",
        "address": address,
        "city": city or "Southern California",
        "phone": tags.get("phone") or tags.get("contact:phone") or "",
        "website_listed": website,
        "no_website_reason": reason,
        "source": source,
        "status": "pending",
    }


def overpass_trades() -> list[dict]:
    """Query OSM in regional tiles to avoid timeouts and raise result cap."""
    tiles = [
        (31.45, -121.25, 33.25, -117.85),  # SD + south coast
        (31.45, -117.85, 33.25, -114.10),  # desert / imperial
        (33.25, -121.25, 35.10, -117.85),  # LA + OC + IE west
        (33.25, -117.85, 35.10, -114.10),  # IE + desert north
        (35.10, -121.25, 36.25, -114.10),  # central coast + high desert
    ]
    seen_ids: set[int] = set()
    elements: list[dict] = []
    for i, bbox in enumerate(tiles, 1):
        south, west, north, east = bbox
        print(f"  Overpass tile {i}/{len(tiles)}...")
        batch = _overpass_query(south, west, north, east)
        for el in batch:
            eid = el.get("id")
            if eid in seen_ids:
                continue
            seen_ids.add(eid)
            elements.append(el)
        print(f"    tile {i}: +{len(batch)} elements (running total {len(elements)})")
    return elements


OVERPASS_MIRRORS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]


def _overpass_query(south: float, west: float, north: float, east: float) -> list[dict]:
    """Small per-craft queries to avoid 504 timeouts."""
    crafts = ("plumber", "hvac", "roofer", "heating_engineer")
    elements: list[dict] = []
    for craft in crafts:
        query = f"""
        [out:json][timeout:90];
        (
          node["craft"="{craft}"]({south},{west},{north},{east});
          way["craft"="{craft}"]({south},{west},{north},{east});
        );
        out tags 400;
        """
        for mirror in OVERPASS_MIRRORS:
            try:
                response = requests.post(
                    mirror,
                    data={"data": query},
                    timeout=120,
                    headers={"User-Agent": "SolenaDigitalTradeDiscovery/1.0"},
                )
                response.raise_for_status()
                data = response.json()
                batch = data.get("elements", [])
                elements.extend(batch)
                break
            except requests.RequestException as exc:
                print(f"    {craft}@{mirror.split('/')[2]} failed: {exc}")
                continue
        time.sleep(1.0)
    return elements


def parse_business_name_from_title(title: str) -> str | None:
    if not title:
        return None
    t = title.strip()
    for sep in (" | ", " - ", " – ", " — ", " :: "):
        if sep in t:
            t = t.split(sep)[0].strip()
    t = re.sub(r"\s*\|\s*Yelp.*$", "", t, flags=re.I)
    t = re.sub(r"\s*-\s*MapQuest.*$", "", t, flags=re.I)
    if len(t) < 4 or len(t) > 70:
        return None
    if is_generic_name(t):
        return None
    return t


def nominatim_trades() -> list[dict]:
    from discover_businesses import NOMINATIM_URL

    rows: list[dict] = []
    seen: set[str] = set()
    excluded = load_excluded()

    for trade in ("plumber", "hvac", "roofer"):
        label = TRADE_SEARCH_LABEL[trade]
        for city in SEARCH_CITIES:
            query = f"{label} {city} California"
            print(f"Nominatim: {query}")
            try:
                response = requests.get(
                    NOMINATIM_URL,
                    params={"q": query, "format": "jsonv2", "limit": 15, "countrycodes": "us"},
                    timeout=30,
                    headers={"User-Agent": "SoCalWebCoTradeDiscovery/1.0"},
                )
                response.raise_for_status()
                results = response.json()
            except requests.RequestException as exc:
                print(f"  error: {exc}")
                continue

            for item in results:
                name = item.get("name") or item.get("display_name", "").split(",")[0]
                if not name or name.lower() in seen:
                    continue
                display = item.get("display_name", "")
                if "california" not in display.lower():
                    continue
                if not in_socal(city, display):
                    continue
                if classify_trade(name, {}) != trade:
                    continue
                seen.add(name.lower())
                city_match = city.title()
                for kw in SOCAL_CITY_KEYWORDS:
                    if kw in display.lower():
                        city_match = kw.title()
                        break
                tags = {"addr:city": city_match}
                row = row_from_element(name, tags, trade, excluded, source="nominatim")
                if row:
                    row["address"] = display
                    row["city"] = city_match
                    row["source"] = "nominatim"
                    rows.append(row)
            time.sleep(1.05)
    return rows


def extract_address_from_snippet(body: str, city: str) -> str:
    if not body:
        return f"{city.title()}, CA"
    m = re.search(
        r"(\d+\s+[A-Za-z0-9\s\.#]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Drive|Dr|Road|Rd|Way|Lane|Ln|Court|Ct)\.?)",
        body,
        re.I,
    )
    if m:
        return f"{m.group(1).strip()}, {city.title()}, CA"
    return f"{city.title()}, CA"


def google_discover_trades(excluded: set[str], seen_names: set[str], cities: list[str] | None = None) -> list[dict]:
    from google_places import load_api_key, search_text, throttle

    if not load_api_key():
        print("  Google Places: no API key — skip discovery")
        return []

    cities = cities or SEARCH_CITIES
    rows: list[dict] = []
    requests_made = 0

    for trade in ("plumber", "hvac", "roofer"):
        label = TRADE_SEARCH_LABEL[trade]
        print(f"Google Places: {trade}...")
        for city in cities:
            query = f"{label} in {city} California"
            try:
                results = search_text(query)
            except Exception as exc:
                print(f"  {city}: error — {exc}")
                throttle(0.5)
                continue
            requests_made += 1
            city_rows = 0
            for place in results:
                name = (place.get("google_name") or "").strip()
                if not name or len(name) < 3:
                    continue
                key = name.lower()
                if key in seen_names or key in excluded:
                    continue
                if is_chain(name) or is_trade_chain(name) or is_generic_name(name):
                    continue
                detected = classify_trade(name, {})
                if detected is not None and detected != trade:
                    continue

                address = place.get("google_address") or f"{city.title()}, CA"
                city_match = place.get("city") or city.title()
                if not in_socal(city_match, address):
                    continue

                slug = slugify(name, city_match)
                if slug in excluded:
                    continue

                seen_names.add(key)
                website = place.get("google_website") or ""
                qualifies, reason = qualifies_as_no_website(website)

                row = {
                    "name": name,
                    "slug": slug,
                    "industry": "home_services",
                    "trade": trade,
                    "region": "socal",
                    "address": address,
                    "city": city_match,
                    "phone": place.get("google_phone") or "",
                    "website_listed": website,
                    "no_website_reason": reason if website else "no_website_listed",
                    "source": "google_places",
                    "status": "pending",
                    "google_maps_url": place.get("google_maps_url") or "",
                    "google_website": website,
                    "google_phone": place.get("google_phone") or "",
                    "google_address": address,
                }
                if place.get("business_status") == "CLOSED_PERMANENTLY":
                    continue
                rows.append(row)
                city_rows += 1

            if city_rows:
                print(f"  {city}: +{city_rows}")
            throttle(0.15)

    print(f"  Google Places: {requests_made} searches, {len(rows)} candidates")
    return rows


def ddg_discover_all(excluded: set[str], seen_names: set[str]) -> list[dict]:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        return []

    rows: list[dict] = []
    with DDGS() as ddgs:
        for trade in ("plumber", "hvac", "roofer"):
            print(f"DuckDuckGo: {trade}...")
            label = TRADE_SEARCH_LABEL[trade]
            for city in SEARCH_CITIES:
                queries = [
                    f'"{label}" "{city}" California phone',
                    f'"{label}" "{city}" CA address',
                    f'site:mapquest.com "{label}" "{city}" CA',
                ]
                city_rows: list[dict] = []
                for query in queries:
                    try:
                        results = list(ddgs.text(query, max_results=25, region="us-en"))
                    except Exception:
                        try:
                            results = list(ddgs.text(query, max_results=25))
                        except Exception:
                            continue
                    for item in results:
                        title = item.get("title") or ""
                        body = item.get("body") or ""
                        href = item.get("href") or item.get("link") or ""
                        blob = f"{title} {body} {href}".lower()
                        if not any(k in blob for k in (" ca", "california", city)):
                            continue
                        if any(bad in blob for bad in (" utah", " texas", " arizona", " nevada")):
                            continue
                        name = parse_business_name_from_title(title)
                        if not name:
                            continue
                        key = name.lower()
                        if key in seen_names or key in excluded:
                            continue
                        if is_chain(name) or is_trade_chain(name):
                            continue
                        if classify_trade(name, {}) != trade:
                            continue
                        seen_names.add(key)
                        row = {
                            "name": name,
                            "slug": slugify(name, city),
                            "industry": "home_services",
                            "trade": trade,
                            "region": "socal",
                            "address": extract_address_from_snippet(body, city),
                            "city": city.title(),
                            "phone": "",
                            "website_listed": "",
                            "no_website_reason": "discovered_via_search",
                            "source": "duckduckgo",
                            "status": "pending",
                            "discovery_url": href,
                        }
                        if row["slug"] in excluded:
                            continue
                        city_rows.append(row)
                    time.sleep(0.25)
                if city_rows:
                    print(f"  {city}: +{len(city_rows)}")
                rows.extend(city_rows)
    return rows


def discover(
    refresh: bool = False,
    skip_ddg: bool = False,
    skip_nominatim: bool = False,
    google_discovery: bool = False,
    google_only: bool = False,
) -> list[dict]:
    cache = DATA / "trades-pool-raw.json"
    if not refresh and cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))

    excluded = load_excluded()
    rows: list[dict] = []
    seen_names: set[str] = set()

    from google_places import load_api_key

    use_google = google_discovery or google_only
    if use_google and not load_api_key():
        raise SystemExit(
            "Google Places API key required. Run: python scripts/setup_google.py\n"
            "Docs: docs/GOOGLE_PLACES_SETUP.md"
        )

    if google_only:
        rows.extend(google_discover_trades(excluded, seen_names))
    else:
        if use_google:
            before = len(rows)
            rows.extend(google_discover_trades(excluded, seen_names))
            print(f"  Added {len(rows) - before} from Google Places (total {len(rows)})")

        if not google_only:
            try:
                print("Querying OpenStreetMap (tiled, per-craft)...")
                elements = overpass_trades()
                print(f"  Overpass returned {len(elements)} elements")
                for el in elements:
                    tags = el.get("tags") or {}
                    name = tags.get("name")
                    if not name or name.lower() in seen_names:
                        continue
                    trade = classify_trade(name, tags)
                    if not trade:
                        continue
                    row = row_from_element(name, tags, trade, excluded, source="openstreetmap")
                    if row:
                        seen_names.add(name.lower())
                        rows.append(row)
                print(f"  OSM trade candidates: {len(rows)}")
            except requests.RequestException as exc:
                print(f"  Overpass failed: {exc}")

            before = len(rows)
            if skip_nominatim:
                print("  Skipping Nominatim (fast mode)")
            else:
                rows.extend(nominatim_trades())
                print(f"  Added {len(rows) - before} from Nominatim (total {len(rows)})")

            before = len(rows)
            if not skip_ddg:
                rows.extend(ddg_discover_all(excluded, seen_names))
                print(f"  Added {len(rows) - before} from DuckDuckGo (total {len(rows)})")
            else:
                print("  Skipping DuckDuckGo")

    rows = dedupe_by_name(rows)
    priority = {"plumber": 0, "hvac": 1, "roofer": 2}
    source_rank = {"google_places": 0, "openstreetmap": 1, "nominatim": 2, "duckduckgo": 3}
    rows.sort(key=lambda r: (
        priority.get(r["trade"], 9),
        source_rank.get(r.get("source", ""), 9),
        r.get("city", ""),
        r["name"],
    ))

    DATA.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover SoCal trade businesses")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--skip-ddg", action="store_true")
    parser.add_argument("--skip-nominatim", action="store_true", help="Skip slow Nominatim (use OSM+DDG)")
    parser.add_argument("--google-discovery", action="store_true", help="Add Google Places text search")
    parser.add_argument("--google-only", action="store_true", help="Google Places only (fastest for 200 list)")
    args = parser.parse_args()

    rows = discover(
        refresh=args.refresh,
        skip_ddg=args.skip_ddg,
        skip_nominatim=args.skip_nominatim,
        google_discovery=args.google_discovery,
        google_only=args.google_only,
    )
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["trade"]] = counts.get(r["trade"], 0) + 1
    print(f"\nPool: {len(rows)} candidates")
    for trade in ("plumber", "hvac", "roofer"):
        print(f"  {trade}: {counts.get(trade, 0)}")


if __name__ == "__main__":
    main()
