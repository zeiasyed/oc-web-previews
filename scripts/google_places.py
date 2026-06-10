"""Google Places API (New) lookup and trade discovery."""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "google.json"
SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
USER_AGENT = "OCWebCoVerification/1.0"

# SoCal + Central Coast south + desert (matches discover_trades.SOCAL_BBOX)
SOCAL_LOCATION_BIAS = {
    "rectangle": {
        "low": {"latitude": 31.45, "longitude": -121.25},
        "high": {"latitude": 36.25, "longitude": -114.10},
    }
}

DISCOVERY_FIELD_MASK = (
    "places.displayName,places.formattedAddress,"
    "places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,"
    "places.businessStatus"
)

LOOKUP_FIELD_MASK = (
    "places.displayName,places.formattedAddress,"
    "places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri"
)


def load_api_key() -> str | None:
    key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
    if key:
        return key
    if CONFIG_PATH.exists():
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        key = (data.get("places_api_key") or "").strip()
        if key:
            return key
    return None


def parse_city_from_address(address: str) -> str:
    if not address:
        return ""
    m = re.search(r",\s*([^,]+),\s*CA(?:\s+\d{5})?(?:,|\s*$)", address, re.I)
    if m:
        return m.group(1).strip()
    parts = [p.strip() for p in address.split(",") if p.strip()]
    if len(parts) >= 2 and parts[-1].upper() in {"USA", "UNITED STATES"}:
        if len(parts) >= 3:
            return parts[-3]
    if len(parts) >= 2:
        return parts[-2]
    return ""


def _place_result(place: dict) -> dict:
    display = place.get("displayName") or {}
    name = display.get("text") or ""
    address = place.get("formattedAddress") or ""
    return {
        "google_name": name,
        "google_address": address,
        "google_phone": place.get("nationalPhoneNumber") or "",
        "google_website": place.get("websiteUri") or "",
        "google_maps_url": place.get("googleMapsUri") or "",
        "city": parse_city_from_address(address),
        "business_status": place.get("businessStatus") or "",
    }


def search_text(
    text_query: str,
    *,
    max_result_count: int = 20,
    location_bias: dict | None = SOCAL_LOCATION_BIAS,
    field_mask: str = DISCOVERY_FIELD_MASK,
) -> list[dict]:
    api_key = load_api_key()
    if not api_key:
        return []

    payload: dict = {
        "textQuery": text_query,
        "regionCode": "US",
        "maxResultCount": min(max_result_count, 20),
    }
    if location_bias:
        payload["locationBias"] = location_bias

    response = requests.post(
        SEARCH_URL,
        json=payload,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": field_mask,
        },
        timeout=25,
    )
    response.raise_for_status()
    places = response.json().get("places") or []
    return [_place_result(place) for place in places]


def search_place(name: str, city: str, address: str = "") -> dict | None:
    api_key = load_api_key()
    if not api_key:
        return None

    query = f"{name} {address}".strip() if address else f"{name} {city} California"
    response = requests.post(
        SEARCH_URL,
        json={"textQuery": query, "regionCode": "US", "maxResultCount": 1},
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": LOOKUP_FIELD_MASK,
        },
        timeout=20,
    )
    response.raise_for_status()
    places = response.json().get("places") or []
    if not places:
        return None
    return _place_result(places[0])


def google_maps_search_url(name: str, address: str, city: str) -> str:
    from urllib.parse import quote_plus

    query = f"{name} {address or city} CA".strip()
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(query)}"


def throttle(seconds: float = 0.15) -> None:
    time.sleep(seconds)
