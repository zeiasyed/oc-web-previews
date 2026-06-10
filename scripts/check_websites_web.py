"""
Free website verification via web search (no Google Places API / no credit card).

Uses DuckDuckGo search to find likely business websites, then probes URLs.
Run: python scripts/check_websites_web.py
"""

from __future__ import annotations

import argparse
import csv
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

from check_website import is_social_or_directory, website_is_live

ROOT = Path(__file__).resolve().parents[1]

SOCIAL_DOMAINS = {
    "facebook.com", "yelp.com", "linkedin.com", "instagram.com", "twitter.com",
    "x.com", "yellowpages.com", "bbb.org", "mapquest.com", "hotfrog.com",
    "manta.com", "alignable.com", "birdeye.com", "n49.com", "lacartes.com",
    "localitybiz.com", "dandb.com", "mechanicadvisor.com", "carwise.com",
    "giftly.com", "bdir.in", "prospeo.io", "lendersa.com", "wikipedia.org",
    "google.com", "goo.gl", "g.page", "maps.google.com",
}

FIELDNAMES = [
    "name", "slug", "industry", "address", "city", "phone",
    "website_listed", "no_website_reason", "source", "status",
    "verification_status", "verification_notes", "google_maps_url",
    "google_website", "google_phone", "google_address",
    "web_search_website", "web_search_confidence",
]


def search_duckduckgo(query: str, max_results: int = 8) -> list[dict]:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        raise SystemExit("Install: python -m pip install duckduckgo-search")

    results = []
    with DDGS() as ddgs:
        for item in ddgs.text(query, max_results=max_results):
            results.append(item)
    return results


def domain(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def is_directory(url: str) -> bool:
    d = domain(url)
    return any(d == s or d.endswith("." + s) for s in SOCIAL_DOMAINS)


def name_tokens(name: str) -> set[str]:
    stop = {"inc", "llc", "the", "and", "of", "co", "corp", "company", "services", "center", "centers"}
    tokens = set(re.findall(r"[a-z0-9]+", name.lower()))
    return tokens - stop


def score_result(name: str, city: str, url: str, title: str, body: str) -> int:
    if is_directory(url) or is_social_or_directory(url):
        return -10

    d = domain(url)
    tokens = [t for t in name_tokens(name) if len(t) > 3]
    blob = f"{d} {title} {body}".lower()

    if not tokens:
        return -10

    domain_hits = sum(1 for t in tokens if t in d.replace("-", "").replace(".", ""))
    text_hits = sum(1 for t in tokens if t in blob)

    if domain_hits == 0 and text_hits < 2:
        return -10

    score = domain_hits * 4 + text_hits * 2

    if city.lower().split()[0] in blob:
        score += 2

    if website_is_live(url):
        score += 2

    return score


def find_website(name: str, city: str, address: str) -> tuple[str, str, str]:
    if re.search(r"\.\w{2,}\b", name):
        m = re.search(r"([\w.-]+\.\w{2,})", name, re.I)
        if m:
            guess = "https://" + m.group(1)
            if website_is_live(guess):
                return guess, "high", f"Business name contains live domain: {guess}"

    queries = [
        f'"{name}" {city} California',
        f"{name} {city} Orange County CA",
        f"{name} {city} CA website",
    ]

    all_results: list[dict] = []
    for query in queries:
        try:
            batch = search_duckduckgo(query)
            all_results.extend(batch)
            if batch:
                break
        except Exception as exc:
            return "", "error", f"Search failed: {exc}"
        time.sleep(0.5)

    if not all_results:
        return "", "error", "Web search returned no results — manual review needed"

    best_url = ""
    best_score = 0

    for r in all_results:
        url = r.get("href") or r.get("link") or ""
        if not url.startswith("http"):
            continue
        s = score_result(name, city, url, r.get("title", ""), r.get("body", ""))
        if s > best_score:
            best_score = s
            best_url = url

    if best_score >= 5 and best_url:
        return best_url, "high", f"Web search found likely website (score {best_score}): {best_url}"

    if best_url and best_score >= 3:
        return best_url, "medium", f"Possible website (score {best_score}): {best_url} — needs manual review"

    if all_results:
        return "", "none", "Web search: only directory listings, no standalone website found"

    return "", "error", "Web search inconclusive — manual review needed"


def verify_row(row: dict) -> dict:
    # Re-check any URL already listed in OSM
    if row.get("website_listed"):
        url = row["website_listed"]
        if not is_social_or_directory(url) and website_is_live(url):
            row["web_search_website"] = url
            row["web_search_confidence"] = "high"
            row["verification_status"] = "rejected_has_website"
            row["verification_notes"] = f"OSM website is live: {url}"
            row["status"] = "rejected"
            return row

    url, confidence, note = find_website(row["name"], row.get("city", ""), row.get("address", ""))
    row["web_search_website"] = url
    row["web_search_confidence"] = confidence

    maps_url = row.get("google_maps_url") or ""
    if not maps_url:
        from google_places import google_maps_search_url
        maps_url = google_maps_search_url(row["name"], row.get("address", ""), row.get("city", ""))
        row["google_maps_url"] = maps_url

    notes = [note]

    if url and confidence == "high" and not is_social_or_directory(url):
        row["verification_status"] = "rejected_has_website"
        row["verification_notes"] = "; ".join(notes)
        row["status"] = "rejected"
    elif url and confidence == "medium":
        row["verification_status"] = "needs_manual_review"
        row["verification_notes"] = "; ".join(notes) + f"; Check Maps: {maps_url}"
        row["status"] = "review"
    elif confidence == "error":
        row["verification_status"] = "needs_manual_review"
        row["verification_notes"] = "; ".join(notes) + f"; Check Maps: {maps_url}"
        row["status"] = "review"
    elif confidence == "none":
        row["verification_status"] = "approved"
        row["verification_notes"] = "; ".join(notes) + f"; Confirm on Maps: {maps_url}"
        row["status"] = "approved"
    else:
        row["verification_status"] = "needs_manual_review"
        row["verification_notes"] = "; ".join(notes) + f"; Check Maps: {maps_url}"
        row["status"] = "review"

    return row


def main() -> None:
    parser = argparse.ArgumentParser(description="Free web-search website verification")
    parser.add_argument("--csv", default=str(ROOT / "data" / "pilot-10.csv"))
    parser.add_argument("--slug")
    args = parser.parse_args()

    path = Path(args.csv)
    with path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    if args.slug:
        rows = [r for r in rows if r["slug"] == args.slug]

    out = []
    for i, row in enumerate(rows):
        print(f"({i+1}/{len(rows)}) {row['name']}...")
        out.append(verify_row(row))
        print(f"  -> {row['verification_status']}: {row.get('web_search_website') or 'no site found'}")
        time.sleep(1.5)

    if args.slug:
        all_rows = list(csv.DictReader(path.open(newline="", encoding="utf-8")))
        for i, r in enumerate(all_rows):
            if r["slug"] == args.slug:
                all_rows[i] = out[0]
        rows = all_rows
    else:
        rows = out

    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    approved = sum(1 for r in rows if r.get("verification_status") == "approved")
    rejected = sum(1 for r in rows if r.get("verification_status") == "rejected_has_website")
    review = sum(1 for r in rows if r.get("verification_status") == "needs_manual_review")
    print(f"\nDone: {approved} approved, {rejected} rejected (has website), {review} need review")


if __name__ == "__main__":
    main()
