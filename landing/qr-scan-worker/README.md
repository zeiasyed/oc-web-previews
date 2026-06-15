# QR scan tracker (no QR URL changes)

Printed postcards already point to:

`https://zeiasyed.github.io/oc-web-previews/landing/connect.html?biz=SLUG`

This worker records a scan when that page loads. **Do not change QR codes.**

## Setup (one time)

1. Create D1 database:
   ```bash
   cd landing/qr-scan-worker
   npx wrangler d1 create solena-qr-scans
   ```
   Copy `database_id` into `wrangler.toml`.

2. Apply schema:
   ```bash
   npx wrangler d1 execute solena-qr-scans --file=schema.sql
   ```

3. Set dashboard password:
   ```bash
   npx wrangler secret put DASHBOARD_PASSWORD
   ```

4. Deploy:
   ```bash
   npx wrangler deploy
   ```

5. Put the worker URL in `config/branding.json`:
   ```json
   "qr_scan_api": "https://solena-qr-scan.YOUR_SUBDOMAIN.workers.dev"
   ```

6. Sync branding and push to GitHub Pages:
   ```bash
   python scripts/sync_branding.py
   git push
   ```

## Dashboard

Open: `https://zeiasyed.github.io/oc-web-previews/landing/scan-dashboard/`

Sign in with `DASHBOARD_PASSWORD`.

Each scan stores scanner location from Cloudflare IP geolocation: **city, state (region code), country**. Older scans logged before this feature show `—` for location.

Automated test traffic (PowerShell, curl, Postman, etc.) is **not recorded** and does not appear in the dashboard. Only real browser scans from the printed QR funnel are counted.

## Funnel click tracking

After a QR scan, `funnel-track.js` on connect/pricing/register/payment records:

- **Page views** per funnel step
- **Clicks** on nav steps, CTAs, phone/email, pay button, call-me-back, etc.

View metrics in the scan dashboard under **Funnel steps**, **Top clicks**, and **Recent funnel activity**.
