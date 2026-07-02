# Prospectus CRM

A mobile-first web CRM for managing sales leads, scanning business cards, and finding nearby contacts.

## Quick start (local)

```powershell
cd prospectus-crm/app
python -m http.server 8080
```

Open `http://localhost:8080` in your browser (use Safari on iPhone for the full experience).

## Install on iPhone

1. Open the Prospectus URL in **Safari** (not Chrome).
2. Tap **Share** → **Add to Home Screen**.
3. Launch Prospectus from your home screen — it runs full-screen like an app.

**Deployed URL (GitHub Pages):**
`https://zeiasyed.github.io/oc-web-previews/landing/prospectus-crm/app/`

Shorter redirect: `https://zeiasyed.github.io/oc-web-previews/landing/prospectus-crm/`

## Daily workflow

### 1. Capture a lead from a business card

1. Tap **+** in the bottom nav.
2. Choose **Scan business card**.
3. Take a photo or pick from your gallery.
4. Wait while Prospectus reads the card (you can edit any field).
5. Pick a **sales funnel** (e.g. Clinical Trial Sites, Lab Sites).
6. Set **temperature**: Hot, Warm, Cool, or Dead.
7. Tap **Save lead**.
8. When prompted, tap **Add to Contacts** to download a `.vcf` file — tap it to add to iPhone Contacts.

### 2. Browse your leads

- The **Leads** tab shows all active leads. **Dead leads are hidden by default.**
- Use the search bar for name, company, or city.
- Filter by funnel or temperature.
- To see dead leads: set temperature filter to **Dead only**, or enable **Show dead leads**.

### 3. Lead detail actions

Tap any lead to open:

- **Call** — logged in activity history
- **Email (Gmail / Outlook)** — opens compose as **zeiasyed@nexa-care.com**
- **Set follow-up** — reminder in 1 day, 3 days, 1 week, or custom
- **Schedule visit** — Google Calendar, Outlook, or `.ics` (organizer: zeiasyed@nexa-care.com)
- **Add note** — saved to activity timeline
- **Tasks** — add and complete tasks per lead
- **Activity** — full history of calls, emails, notes, visits
- **Add to iPhone Contacts** — downloads `.vcf`
- **Edit** or **Delete**

### 4. Tasks tab

- View all open tasks across leads
- Tap **+ Task** for a standalone to-do
- Overdue and due-today tasks are highlighted

### 5. Find leads near you

1. Open the **Near Me** tab.
2. Allow location access when prompted.
3. Leads are sorted by distance (miles).
4. Tap **Refresh location** if you have moved.

### 6. Search by city (More tab)

1. Open **More** → **City search**
2. Type a city name or tap a suggestion chip

### 7. Cloud sync (More tab)

1. Deploy the sync worker (see below)
2. In **More** → set **Sync API URL** and **Sync token**
3. Tap **Sync now** — merges data across phone and laptop
4. Auto-syncs when you reopen the app (if configured)

### 8. Settings and data (More tab)

- **Manage funnels** — add or rename categories (Clinical Trial Sites, Lab Sites, etc.)
- **Export backup** — JSON file for safekeeping
- **Import backup** — restore from JSON
- **Load demo data** — adds 12 sample leads
- **Clear all data** — reset everything

## Features

| Feature | How it works |
|---------|----------------|
| Follow-up reminders | Set per lead; banner + notifications when due |
| Activity history | Calls, emails, notes, visits logged automatically |
| Tasks | Per-lead or global to-dos with due dates |
| Cloud sync | Cloudflare Worker + D1 (zeiasyed@nexa-care.com only) |
| Email | Gmail/Outlook compose as zeiasyed@nexa-care.com |
| Calendar | Site visits via Google, Outlook, or .ics |
| Business card scan | Tesseract.js OCR in the browser |
| iPhone Contacts | `.vcf` download + Share API |
| Sales funnels | Custom categories per lead |
| Temperature | Hot / Warm / Cool / Dead |
| Dead filter | Hidden by default; filter to view |
| Near Me | GPS + haversine distance sort |
| City search | In More tab |
| Storage | IndexedDB on device; optional cloud backup |

## Cloud sync worker

```powershell
cd prospectus-crm/worker
npx wrangler d1 create prospectus-crm
# Update database_id in wrangler.toml
npx wrangler d1 execute prospectus-crm --remote --file=../schema/schema.sql
npx wrangler secret put SYNC_TOKEN
npx wrangler deploy
```

Copy the worker URL into **More → Sync API URL**. Use the same token you set with `wrangler secret put`.

## Deploy

```powershell
.\deploy.ps1
```

Or copy `prospectus-crm/app/` to your GitHub Pages path.

## Privacy

All data stays on your device in IndexedDB. Location is used only when you open Near Me. Geocoding uses OpenStreetMap Nominatim when saving leads without coordinates.
