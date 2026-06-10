"""Re-verify plumber websites with stricter page-content validation."""
import csv
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from duckduckgo_search import DDGS

DATA = Path(__file__).parent
IN_JSON = DATA / "tx-plumbers-200.json"
OUT_JSON = DATA / "tx-plumbers-200.json"
OUT_CSV = DATA / "tx-plumbers-200.csv"

DIRECTORY_DOMAINS = {
    "yelp.com", "yellowpages.com", "bbb.org", "angi.com", "angieslist.com",
    "homeadvisor.com", "thumbtack.com", "manta.com", "mapquest.com",
    "facebook.com", "instagram.com", "linkedin.com", "nextdoor.com",
    "buildzoom.com", "porch.com", "expertise.com", "superpages.com",
    "chamberofcommerce.com", "dandb.com", "birdeye.com", "bark.com",
    "houzz.com", "alignable.com", "loc8nearme.com", "showmelocal.com",
    "citysearch.com", "merchantcircle.com", "whitepages.com", "dexknows.com",
    "tsbpe.texas.gov", "vo.licensing.hpc.texas.gov", "google.com",
    "wikipedia.org", "merriam-webster.com", "dictionary.com",
}

GENERIC_DOMAIN_TOKENS = {
    "plumbing", "plumber", "plumb", "service", "services", "company", "inc",
    "llc", "corp", "mechanical", "construction", "texas", "repair", "home",
    "pro", "master", "general", "and", "the", "dba", "co", "group", "local",
}

STOPWORDS = GENERIC_DOMAIN_TOKENS | {
    "buddy", "wise", "cove", "alamo", "taylor", "miller", "larson", "shannon",
    "whitmore", "phelps", "timothy", "anastas", "triple", "layman", "attaboy",
    "rad", "omg", "argyle", "sawyer", "njm", "welds", "doors", "swift",
}


def phone_digits(phone: str) -> str:
    return re.sub(r"\D", "", phone)[-10:]


def distinctive_tokens(name: str) -> list[str]:
    raw = re.findall(r"[a-z0-9]{4,}", name.lower())
    return [t for t in raw if t not in STOPWORDS]


def is_directory(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return any(d in host for d in DIRECTORY_DOMAINS)


def domain_matches_company(domain: str, tokens: list[str]) -> bool:
    if not tokens:
        return False
    d = domain.lower()
    hits = sum(1 for t in tokens if t in d)
    return hits >= 1 and any(len(t) >= 5 for t in tokens if t in d)


def page_validates(url: str, company: str, city: str, phone: str) -> bool:
    try:
        resp = requests.get(
            url,
            timeout=8,
            headers={"User-Agent": "Mozilla/5.0 (compatible; TXPlumberVerifier/1.0)"},
            allow_redirects=True,
        )
        if resp.status_code >= 400:
            return False
        text = resp.text.lower()[:50000]
    except Exception:
        return False

    digits = phone_digits(phone)
    if digits and digits in re.sub(r"\D", "", text):
        return True

    tokens = distinctive_tokens(company)
    if not tokens:
        return False
    name_hit = sum(1 for t in tokens if t in text) >= min(2, len(tokens))
    local_hit = city.lower() in text
    trade_hit = any(w in text for w in ("plumb", "drain", "sewer", "water heater", "pipe"))
    return name_hit and trade_hit and (local_hit or any(t in text for t in tokens))


def find_website(company: str, city: str, phone: str) -> tuple[str | None, str]:
    tokens = distinctive_tokens(company)
    query = f'"{company}" plumbing {city} Texas'
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=10))
    except Exception as exc:
        return None, f"search_error:{exc}"

    candidates = []
    for r in results:
        href = (r.get("href") or r.get("link") or "").split("?")[0].rstrip("/")
        if not href.startswith("http") or is_directory(href):
            continue
        host = urlparse(href).netloc.lower().removeprefix("www.")
        if domain_matches_company(host, tokens):
            candidates.insert(0, href)
        else:
            candidates.append(href)

    seen = set()
    for url in candidates:
        if url in seen:
            continue
        seen.add(url)
        if page_validates(url, company, city, phone):
            return url, "content_verified"

    return None, "not_found"


def main():
    data = json.loads(IN_JSON.read_text(encoding="utf-8"))
    plumbers = data["all"]
    print(f"Re-verifying websites for {len(plumbers)} plumbers...")

    with_site, without_site = [], []
    for i, p in enumerate(plumbers, 1):
        p.pop("website", None)
        p.pop("website_lookup", None)
        p.pop("has_website", None)
        print(f"[{i}/{len(plumbers)}] {p['company_name']} ({p['city']})")
        website, note = find_website(p["company_name"], p["city"], p["phone"])
        p["website"] = website
        p["website_lookup"] = note
        p["has_website"] = bool(website)
        (with_site if website else without_site).append(p)
        time.sleep(1.5)

    data["with_website"] = with_site
    data["without_website"] = without_site
    data["metadata"]["with_website"] = len(with_site)
    data["metadata"]["without_website"] = len(without_site)
    data["metadata"]["notes"] = (
        "License, address, and phone verified against TSBPE daily-updated registry. "
        "Websites verified by matching search results to page content (phone number, "
        "company name, and plumbing-related terms). Absence of website means no "
        "dedicated business site could be confirmed."
    )

    OUT_JSON.write_text(json.dumps(data, indent=2), encoding="utf-8")
    fields = [
        "company_name", "phone", "full_address", "address_line1", "city", "state",
        "zip", "county", "license_number", "license_status", "license_expiration",
        "contact_name", "website", "has_website", "website_lookup", "source", "verified_date",
    ]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(plumbers)

    print(f"\nVerified: {len(with_site)} with website, {len(without_site)} without")


if __name__ == "__main__":
    main()
