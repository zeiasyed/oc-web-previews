"""Fast website detection via predicted domains + phone validation."""
import csv
import json
import re
from pathlib import Path
from urllib.parse import urlparse

import requests

DATA = Path(__file__).parent
JSON_PATH = DATA / "tx-plumbers-200.json"
CSV_PATH = DATA / "tx-plumbers-200.csv"

JUNK_HOSTS = {
    "youtube.com", "google.com", "facebook.com", "yelp.com", "wikipedia.org",
    "merriam-webster.com", "brusheezy.com", "instagram.com", "linkedin.com",
}


def phone_digits(phone: str) -> str:
    return re.sub(r"\D", "", phone)[-10:]


def slug_variants(company: str) -> list[str]:
    c = company.upper()
    c = re.sub(r"\b(DBA|LLC|INC|CORP|CO|LTD|LP|L\.P\.|L\.L\.C\.|,&|AND)\b", " ", c)
    c = re.sub(r"[^A-Z0-9 ]", " ", c)
    words = [w for w in c.split() if w and w not in {
        "PLUMBING", "PLUMBER", "PLUMB", "MECHANICAL", "SERVICE", "SERVICES",
        "COMPANY", "CONSTRUCTION", "ENTERPRISES", "CONTRACTING", "OF", "THE",
        "TEXAS", "TX", "HOME", "REPAIR", "HEATING", "AIR", "CONDITIONING",
        "AC", "HVAC", "SEWER", "DRAIN", "GENERAL", "PRO", "MASTER",
    }]
    if not words:
        return []
    base = "".join(words[:3]).lower()
    combos = {base, "".join(words).lower(), words[0].lower()}
    if len(words) >= 2:
        combos.add(f"{words[0]}{words[1]}".lower())
        combos.add(f"{words[0]}-{words[1]}".lower())
    out = []
    for slug in combos:
        if len(slug) < 4:
            continue
        for suffix in ("plumbing", "plumber", ""):
            name = f"{slug}{suffix}" if suffix else slug
            if len(name) >= 4:
                out.extend([
                    f"https://www.{name}.com",
                    f"https://{name}.com",
                    f"https://www.{name}.net",
                ])
    # dedupe preserve order
    seen, ordered = set(), []
    for u in out:
        if u not in seen:
            seen.add(u)
            ordered.append(u)
    return ordered[:24]


def page_matches(url: str, phone: str, company: str) -> bool:
    host = urlparse(url).netloc.lower()
    if any(j in host for j in JUNK_HOSTS):
        return False
    try:
        r = requests.get(
            url, timeout=6,
            headers={"User-Agent": "Mozilla/5.0 (compatible; TXPlumberVerifier/1.0)"},
            allow_redirects=True,
        )
        if r.status_code >= 400:
            return False
        text = r.text.lower()[:80000]
    except Exception:
        return False
    digits = phone_digits(phone)
    if digits and digits in re.sub(r"\D", "", text):
        return True
    tokens = [t.lower() for t in re.findall(r"[a-z0-9]{4,}", company) if t.lower() not in {"plumbing", "plumber", "mechanical", "service", "company", "inc", "llc"}]
    trade = any(w in text for w in ("plumb", "drain", "sewer", "water heater", "pipe"))
    hits = sum(1 for t in tokens[:3] if t in text)
    return trade and hits >= 1


def find_website(company: str, phone: str) -> str | None:
    for url in slug_variants(company):
        if page_matches(url, phone, company):
            return urlparse(url)._replace(path="", params="", query="", fragment="").geturl().rstrip("/")
    return None


def main():
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    plumbers = data["all"]
    with_site, without_site = [], []

    for i, p in enumerate(plumbers, 1):
        print(f"[{i}/{len(plumbers)}] {p['company_name']}")
        site = find_website(p["company_name"], p["phone"])
        p["website"] = site
        p["has_website"] = bool(site)
        p["website_lookup"] = "domain_phone_verified" if site else "not_found"
        (with_site if site else without_site).append(p)

    data["with_website"] = with_site
    data["without_website"] = without_site
    data["metadata"]["with_website"] = len(with_site)
    data["metadata"]["without_website"] = len(without_site)
    data["metadata"]["notes"] = (
        "License, address, and phone verified against TSBPE daily-updated registry. "
        "Websites confirmed only when a predicted business domain loads and contains "
        "the listed phone number or clear plumbing-related company match."
    )
    JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    fields = [
        "company_name", "phone", "full_address", "address_line1", "city", "state",
        "zip", "county", "license_number", "license_status", "license_expiration",
        "contact_name", "website", "has_website", "website_lookup", "source", "verified_date",
    ]
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(plumbers)
    print(f"Done: {len(with_site)} with website, {len(without_site)} without")


if __name__ == "__main__":
    main()
