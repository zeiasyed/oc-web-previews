"""Sync config/branding.json into landing/assets/branding.js for GitHub Pages."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "branding.json"
OUT = ROOT / "landing" / "assets" / "branding.js"


def main() -> None:
    branding = json.loads(CONFIG.read_text(encoding="utf-8"))
    js_payload = {
        "brand_name": branding["brand_name"],
        "tagline": branding["tagline"],
        "logo_url": branding.get("logo_url", "assets/solena-digital-logo.png"),
        "logo_header_url": branding.get("logo_header_url", branding.get("logo_url", "assets/solena-digital-logo.png")),
        "phone_display": branding["phone_display"],
        "phone": branding["phone"].replace("(", "").replace(")", "").replace("-", "").replace(" ", ""),
        "email_display": branding["email_display"],
        "email": branding["email_display"],
        "calendly_url": branding["calendly_url"],
        "sms_number": branding.get("sms_number", branding["phone_display"]).replace("(", "").replace(")", "").replace("-", "").replace(" ", ""),
        "offer_bullets": branding["offer_bullets"],
        "formspree_endpoint": branding.get("formspree_endpoint", ""),
        "formspree_register_endpoint": branding.get("formspree_register_endpoint", ""),
        "formspree_callback_endpoint": branding.get("formspree_callback_endpoint", ""),
        "stripe_payment_link": branding.get("stripe_payment_link", ""),
        "qr_scan_api": branding.get("qr_scan_api", ""),
    }
    OUT.write_text(f"window.BRANDING = {json.dumps(js_payload, indent=2)};\n", encoding="utf-8")
    print(f"Synced {OUT}")


if __name__ == "__main__":
    main()
