"""Build verified TX plumber list from TSBPE RMP registry + website lookup."""
import csv
import json
import re
import time
from collections import defaultdict
from pathlib import Path

from duckduckgo_search import DDGS

CSV_PATH = Path(__file__).parent / "RMP.csv"
OUT_JSON = Path(__file__).parent / "tx-plumbers-200.json"
OUT_CSV = Path(__file__).parent / "tx-plumbers-200.csv"
TARGET = 200

DIRECTORY_DOMAINS = {
    "yelp.com", "yellowpages.com", "bbb.org", "angi.com", "angieslist.com",
    "homeadvisor.com", "thumbtack.com", "manta.com", "mapquest.com",
    "facebook.com", "instagram.com", "linkedin.com", "nextdoor.com",
    "buildzoom.com", "porch.com", "expertise.com", "superpages.com",
    "chamberofcommerce.com", "dandb.com", "birdeye.com", "bark.com",
    "houzz.com", "alignable.com", "loc8nearme.com", "showmelocal.com",
    "citysearch.com", "merchantcircle.com", "whitepages.com", "dexknows.com",
    "tsbpe.texas.gov", "vo.licensing.hpc.texas.gov",
}

SKIP_COMPANY = re.compile(
    r"^(self|none|n/a|na|independent|retired|unemployed|\*|\.)$", re.I
)


def normalize_company(name: str) -> str:
    n = (name or "").strip().upper()
    n = re.sub(r"\s+", " ", n)
    n = re.sub(r"[.,]+$", "", n)
    return n


def format_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    if len(digits) == 11 and digits[0] == "1":
        return f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    return raw.strip() if raw else ""


def full_address(row: dict) -> str:
    parts = [row.get("ADDR1", "").strip()]
    if row.get("ADDR2", "").strip():
        parts.append(row["ADDR2"].strip())
    city = row.get("CITY", "").strip()
    state = row.get("STATE", "").strip()
    zipcode = row.get("ZIP", "").strip()
    parts.append(f"{city}, {state} {zipcode}".strip(", "))
    return ", ".join(p for p in parts if p)


def load_plumbers():
    companies: dict[str, dict] = {}
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("LIC_STATUS") != "Current":
                continue
            if row.get("STATE", "").strip().upper() != "TX":
                continue
            phone = format_phone(row.get("PHONE", ""))
            if not phone:
                continue
            company = (row.get("PLUMB_COMPANY") or "").strip()
            if not company or SKIP_COMPANY.match(company):
                company = f"{row.get('FIRST_NAME', '').strip()} {row.get('LAST_NAME', '').strip()} Plumbing".strip()
            key = normalize_company(company)
            if not key:
                continue
            county = row.get("COUNTY", "").strip()
            entry = {
                "company_name": company,
                "license_number": row.get("LICENSE_NBR", "").strip(),
                "license_status": row.get("LIC_STATUS", "").strip(),
                "license_expiration": row.get("EXPIRATION_DTE", "").strip(),
                "contact_name": f"{row.get('FIRST_NAME', '').strip()} {row.get('LAST_NAME', '').strip()}".strip(),
                "address_line1": row.get("ADDR1", "").strip(),
                "address_line2": row.get("ADDR2", "").strip(),
                "city": row.get("CITY", "").strip(),
                "state": row.get("STATE", "").strip(),
                "zip": row.get("ZIP", "").strip(),
                "county": county,
                "phone": phone,
                "full_address": full_address(row),
                "source": "TSBPE Responsible Master Plumber Registry",
                "verified_date": "2026-06-10",
            }
            if key not in companies:
                companies[key] = entry
            elif county and companies[key].get("county") != county:
                pass  # keep first
    return list(companies.values())


def select_diverse(plumbers: list[dict], target: int) -> list[dict]:
    by_county: dict[str, list[dict]] = defaultdict(list)
    for p in plumbers:
        by_county[p["county"] or "UNKNOWN"].append(p)

    selected: list[dict] = []
    counties = sorted(by_county.keys(), key=lambda c: len(by_county[c]), reverse=True)
    idx = 0
    while len(selected) < target and counties:
        county = counties[idx % len(counties)]
        bucket = by_county[county]
        if bucket:
            selected.append(bucket.pop(0))
            if not bucket:
                counties = [c for c in counties if by_county[c]]
        else:
            counties = [c for c in counties if by_county[c]]
        idx += 1
        if idx > target * 50:
            break
    return selected[:target]


def is_directory(url: str) -> bool:
    url_lower = url.lower()
    return any(d in url_lower for d in DIRECTORY_DOMAINS)


def find_website(company: str, city: str) -> tuple[str | None, str]:
    query = f'"{company}" plumber {city} Texas'
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=8))
    except Exception as e:
        return None, f"search_error: {e}"

    company_tokens = set(re.findall(r"[a-z0-9]{3,}", company.lower()))
    for r in results:
        href = r.get("href") or r.get("link") or ""
        if not href.startswith("http"):
            continue
        if is_directory(href):
            continue
        domain_match = re.search(r"https?://(?:www\.)?([^/]+)", href)
        if not domain_match:
            continue
        domain = domain_match.group(1).lower()
        domain_tokens = set(re.findall(r"[a-z0-9]{3,}", domain))
        if company_tokens & domain_tokens:
            return href.split("?")[0].rstrip("/"), "verified_match"
        title = (r.get("title") or "").lower()
        body = (r.get("body") or "").lower()
        if any(t in title or t in body for t in list(company_tokens)[:3] if len(t) > 4):
            return href.split("?")[0].rstrip("/"), "likely_match"

    return None, "not_found"


def main():
    print("Loading TSBPE registry...")
    all_plumbers = load_plumbers()
    print(f"Unique companies with current license + phone: {len(all_plumbers)}")

    selected = select_diverse(all_plumbers, TARGET)
    print(f"Selected {len(selected)} for website lookup...")

    with_website = []
    without_website = []

    for i, p in enumerate(selected, 1):
        print(f"[{i}/{len(selected)}] {p['company_name']} ({p['city']})")
        website, note = find_website(p["company_name"], p["city"])
        p["website"] = website
        p["website_lookup"] = note
        p["has_website"] = bool(website)
        if website:
            with_website.append(p)
        else:
            without_website.append(p)
        time.sleep(1.2)

    output = {
        "metadata": {
            "total": len(selected),
            "with_website": len(with_website),
            "without_website": len(without_website),
            "source": "Texas State Board of Plumbing Examiners (TSBPE) RMP List",
            "source_url": "https://tsbpe.texas.gov/free-licensee-list/",
            "verified_date": "2026-06-10",
            "notes": (
                "License, address, and phone verified against TSBPE daily-updated registry. "
                "Websites verified via web search; absence of website means no dedicated "
                "business site found (may still appear on Yelp/Google/Facebook)."
            ),
        },
        "with_website": with_website,
        "without_website": without_website,
        "all": selected,
    }

    OUT_JSON.write_text(json.dumps(output, indent=2), encoding="utf-8")

    fieldnames = [
        "company_name", "phone", "full_address", "address_line1", "city", "state",
        "zip", "county", "license_number", "license_status", "license_expiration",
        "contact_name", "website", "has_website", "website_lookup", "source", "verified_date",
    ]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(selected)

    print(f"\nDone: {len(with_website)} with website, {len(without_website)} without")
    print(f"Wrote {OUT_JSON} and {OUT_CSV}")


if __name__ == "__main__":
    main()
