# OC Web Co — Orange County Preview Outreach

Private pilot repository for generating demo websites, tracked QR landing pages, and print-ready postcards for Orange County businesses without standalone websites.

## One-command run (no step-by-step)

```powershell
cd oc-web-previews
.\run.ps1                  # discover 10 + generate all sites + postcards
.\run.ps1 --skip-discover  # reuse existing CSV, regenerate everything
.\run-sample.ps1           # sample only (1 site + 1 postcard)
```

Or: `python scripts/run_all.py`

## Quick start (manual steps)

```powershell
cd oc-web-previews
python -m pip install -r scripts/requirements.txt

# 1) Discover businesses (free OpenStreetMap — no API key)
python scripts/discover_businesses.py --limit 10

# 2) Generate ONE sample site (pilot review step)
python scripts/generate_site.py --limit 1

# 3) Sync branding + postcard for that sample
python scripts/sync_branding.py
python scripts/generate_postcards.py --slug YOUR-SLUG-HERE

# 4) Open locally
start previews\YOUR-SLUG-HERE\index.html
start landing\connect.html?biz=YOUR-SLUG-HERE
```

## After you approve the sample

```powershell
python scripts/generate_site.py
python scripts/generate_postcards.py
python scripts/sync_branding.py
```

## GitHub Pages deploy

1. Create a **private** repo named `oc-web-previews` on GitHub
2. Update `config/branding.json` → `github_pages_base` with your URL:
   `https://YOUR_USERNAME.github.io/oc-web-previews`
3. Update real contact info in `config/branding.json`, then run `python scripts/sync_branding.py`
4. Push to `main` and enable **GitHub Pages → Source: GitHub Actions**

QR links format:

`https://YOUR_USERNAME.github.io/oc-web-previews/landing/connect.html?biz=SLUG`

## Project layout

- `data/` — business CSV exports
- `scripts/` — discovery, generation, postcards
- `templates/` — industry site templates
- `previews/` — generated static demo sites
- `landing/` — tracked connect page (`?biz=slug`)
- `postcards/png/` — 5×7 print-ready PNGs @ 300 DPI
- `config/branding.json` — edit contact info here

## Notes

- Discovery uses **OpenStreetMap (free)**. Always manually review the CSV before mailing.
- Demo sites include a subtle footer: *Preview by OC Web Co · Not your live site yet*
- Contact form uses free **mailto** fallback; add Formspree endpoint in config if desired.
