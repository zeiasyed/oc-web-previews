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

- **Call** / **Email** / **Maps** — one tap
- **Add to iPhone Contacts** — downloads `.vcf`
- **Share contact** — iOS share sheet when available
- **Edit** or **Delete**

### 4. Find leads near you

1. Open the **Near Me** tab.
2. Allow location access when prompted.
3. Leads are sorted by distance (miles).
4. Tap **Refresh location** if you have moved.

### 5. Search by city

1. Open the **City** tab.
2. Type a city name or tap a suggestion chip.
3. All stored leads in that city appear (dead leads excluded).

### 6. Settings and data (More tab)

- **Manage funnels** — add or rename categories (Clinical Trial Sites, Lab Sites, etc.)
- **Export backup** — JSON file for safekeeping
- **Import backup** — restore from JSON
- **Load demo data** — adds 12 sample leads
- **Clear all data** — reset everything

## Features

| Feature | How it works |
|---------|----------------|
| Business card scan | Tesseract.js OCR in the browser |
| iPhone Contacts | `.vcf` download + Share API |
| Sales funnels | Custom categories per lead |
| Temperature | Hot / Warm / Cool / Dead |
| Dead filter | Hidden by default; filter to view |
| Near Me | GPS + haversine distance sort |
| City search | Text match on stored city field |
| Storage | IndexedDB on your device (no account) |

## Deploy

```powershell
.\deploy.ps1
```

Or copy `prospectus-crm/app/` to your GitHub Pages path.

## Privacy

All data stays on your device in IndexedDB. Location is used only when you open Near Me. Geocoding uses OpenStreetMap Nominatim when saving leads without coordinates.
