# NexaFlow Demo

Standalone local demo: **NexaFlow** sync console + **mock Medidata Rave** EDC.

## Quick start

```powershell
cd nexa-source-flow-demo
.\setup.ps1      # venv + demo dataset (one time)
.\run_demo.ps1   # start both apps
```

- **Console:** http://127.0.0.1:5050 — select subjects + visit, run sync
- **Mock EDC:** http://127.0.0.1:5051 — sign in (any credentials), verify populated CRFs

## Demo flow

1. Open console → select subjects and visit → **Sync to EDC**
2. Watch live log + progress bar
3. Click **Open EDC to verify** → mock Rave login → view synced forms

Use **Reset demo** to clear mock EDC data between runs.

## Data sources

**Default:** `scripts/generate_fallback_dataset.py` builds demo values for all 45 subjects × 10 visits (no network needed).

**Live ClinSpark CSVs (optional):** Place `credentials.json` + `token.json` in this folder, then:

```powershell
python scripts\fetch_assets.py
python scripts\build_demo_dataset.py
```

If Google Drive token is expired, re-auth runs in the browser when you execute `fetch_assets.py`.

## OAuth

OAuth files are gitignored. Copy from OneDrive if setting up on a new machine.

## Study data

- Protocol **20250012**, 45 subjects, 10 visits
- ClinSpark raw CSVs from Google Drive
- Rave form HTML exports in `demo_data/rave_html/`
