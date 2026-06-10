"""Test Google Places API key and run a sample lookup."""

from __future__ import annotations

import sys

from google_places import load_api_key, search_place


def main() -> None:
    key = load_api_key()
    if not key:
        print("No API key found.")
        print("Setup:")
        print("  1. Copy config/google.json.example to config/google.json")
        print("  2. Paste your key, OR run: python scripts/setup_google.py")
        print("  3. Enable 'Places API (New)' in Google Cloud Console")
        raise SystemExit(1)

    print(f"API key loaded ({key[:8]}...{key[-4:]})")
    print("Testing lookup: Community Collision Center, Rancho Santa Margarita...")

    try:
        result = search_place(
            "Community Collision Center of Santa Margarita",
            "Rancho Santa Margarita",
            "22722 Avenida Empresa, CA 92688",
        )
    except Exception as exc:
        print(f"FAILED: {exc}")
        print("\nCommon fixes:")
        print("  - Enable 'Places API (New)' at console.cloud.google.com")
        print("  - Ensure billing is enabled (free $200/month credit applies)")
        print("  - Restrict key to Places API (New) only")
        raise SystemExit(1)

    if not result:
        print("API works but no result returned for test query.")
        raise SystemExit(0)

    print("SUCCESS — sample Google Places result:")
    for k, v in result.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
