# Google Places API setup

## 1. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or pick an existing one)
3. Enable **billing** — Google gives **~$200/month free credit**, enough for hundreds of lookups

## 2. Enable Places API (New)

Open: [Places API (New)](https://console.cloud.google.com/apis/library/places.googleapis.com)

Click **Enable**.

> Use **Places API (New)** — not the legacy "Places API".

## 3. Create an API key

1. [Credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials** → **API key**
2. Restrict the key (recommended):
   - **API restrictions** → Restrict key → **Places API (New)** only

## 4. Add the key to this project

**Option A — setup script (recommended):**

```powershell
cd oc-web-previews
python scripts/setup_google.py
```

**Option B — manual file:**

Copy `config/google.json.example` → `config/google.json` and paste your key:

```json
{
  "places_api_key": "AIza..."
}
```

**Option C — environment variable:**

```powershell
$env:GOOGLE_PLACES_API_KEY = "AIza..."
```

`config/google.json` is gitignored — your key stays local.

## 5. Test the key

```powershell
python scripts/test_google_places.py
```

You should see Google return name, address, phone, and **websiteUri** for the test business.

## 6. Re-verify your business list

```powershell
python scripts/verify_businesses.py
python scripts/run_all.py --verify-only --skip-discover
```

Businesses with a Google-listed website are marked `rejected_has_website` and skipped during site generation.

## Cost estimate

Text Search (Places API New) ≈ **$0.032 per request**.

| Volume | Approx cost | Covered by free credit? |
|--------|---------------|-------------------------|
| 10 (pilot) | ~$0.32 | Yes |
| 300 | ~$9.60 | Yes |
