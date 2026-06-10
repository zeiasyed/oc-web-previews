# Business verification

Before generating sites or mailing postcards, each business is cross-checked by `scripts/verify_businesses.py`.

## What it checks (free)

1. **Website probe** — re-tests any URL from OpenStreetMap (HEAD/GET request)
2. **Nominatim lookup** — second OpenStreetMap search for a website tag
3. **Google Maps link** — adds a one-click manual review URL to each CSV row

## Optional: Google Places API (recommended before mailing)

For stronger verification, add a Google Places API key:

1. Copy `config/google.json.example` → `config/google.json`
2. Get a key at [Google Cloud Console](https://console.cloud.google.com/)
3. Enable **Places API (New)**
4. Paste your key into `config/google.json`

Google's free tier includes ~$200/month credit — enough for hundreds of lookups.

The verifier then also checks:

- Google-listed **website** (rejects if live)
- Google **phone** and **address** (flags mismatches for manual review)

## Run verification

```powershell
python scripts/verify_businesses.py
python scripts/verify_businesses.py --slug community-collision-center-of-santa-margarita-rancho-santa-m
python scripts/run_all.py --verify-only
```

## CSV columns added

| Column | Meaning |
|--------|---------|
| `verification_status` | `approved`, `rejected_has_website`, or `needs_manual_review` |
| `verification_notes` | Why it got that status |
| `google_maps_url` | Open in browser to double-check manually |
| `google_website` | Website from Google Places (if API enabled) |
| `google_phone` | Phone from Google Places |
| `google_address` | Address from Google Places |

## Generation behavior

`generate_site.py` **skips** businesses marked `rejected_has_website` or `needs_manual_review` unless you pass `--include-unverified`.

Report written to: `data/verification-report.txt`
