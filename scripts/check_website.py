"""Check whether a business appears to have a working standalone website."""

from __future__ import annotations

import re
import socket
from urllib.parse import urlparse

import requests

SOCIAL_ONLY = {
    "facebook.com",
    "fb.com",
    "instagram.com",
    "yelp.com",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "tiktok.com",
    "google.com",
    "maps.google.com",
    "g.page",
    "goo.gl",
    "linktr.ee",
    "square.site",
    "squarespace.com",
    "wixsite.com",
    "godaddysites.com",
    "business.site",
}

USER_AGENT = "OCWebCoDiscovery/1.0 (local business outreach preview)"


def normalize_url(url: str) -> str | None:
    url = url.strip()
    if not url:
        return None
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    parsed = urlparse(url)
    if not parsed.netloc:
        return None
    return url


def domain_from_url(url: str) -> str:
    parsed = urlparse(normalize_url(url) or url)
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def is_social_or_directory(url: str) -> bool:
    host = domain_from_url(url)
    for social in SOCIAL_ONLY:
        if host == social or host.endswith("." + social):
            return True
    return False


def website_is_live(url: str, timeout: float = 8.0) -> bool:
    normalized = normalize_url(url)
    if not normalized:
        return False
    if is_social_or_directory(normalized):
        return False
    try:
        response = requests.head(
            normalized,
            allow_redirects=True,
            timeout=timeout,
            headers={"User-Agent": USER_AGENT},
        )
        if response.status_code < 400:
            return True
        if response.status_code in {403, 405}:
            response = requests.get(
                normalized,
                allow_redirects=True,
                timeout=timeout,
                headers={"User-Agent": USER_AGENT},
                stream=True,
            )
            return response.status_code < 400
    except (requests.RequestException, socket.timeout):
        return False
    return False


def qualifies_as_no_website(website_field: str | None) -> tuple[bool, str]:
    """
    Returns (qualifies, reason).
    Qualifies when there is no live standalone website URL.
    """
    if not website_field or not website_field.strip():
        return True, "no_website_listed"

    normalized = normalize_url(website_field)
    if not normalized:
        return True, "invalid_or_empty_url"

    if is_social_or_directory(normalized):
        return True, "social_or_directory_only"

    if website_is_live(normalized):
        return False, "live_website_found"

    return True, "website_url_not_reachable"
