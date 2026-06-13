# ARI Photo Extractor

Web tool for importing ARI invoice photos, reviewing them (drag into Before/After bins, star print photos), and printing a PDF with **8 cars per page** (1 starred before + 1 starred after each).

## Architecture

| Piece | Host |
|-------|------|
| UI (`app/`) | GitHub Pages |
| API (`worker/`) | Cloudflare Worker + D1 |

## Before you deploy — login blockers found

On this machine:

1. **GitHub CLI (`gh`)** is not installed — needed to create the repo and enable Pages from the terminal.
2. **Cloudflare Wrangler** did not confirm you are logged in — run `npx wrangler login` before deploying the Worker.

Resolve those two before following `DEPLOYMENT.md`.

## Local structure

```
ari-photo-extractor/
  app/           → GitHub Pages (static UI)
  worker/        → Cloudflare Worker API
  DEPLOYMENT.md  → step-by-step deploy
```

## User flow

1. Sign in with **shop password** + **your name** (selections save per name).
2. **ARI settings** — save ARI email/password (encrypted on server).
3. **New import** — batch name, dealership (client name filter), date range → pulls all invoices from ARI via Firebase.
4. **Review** — 4 cars per screen; checkbox to keep; drag photos Unsorted → Before / After; star ★ one before + one after for print.
5. **Print PDF** — browser print dialog, 8 kept cars per page.

## Spec (from your answers)

- All invoices in date range
- Dealership = ARI client name
- Named batches, saved per user
- Shared shop password for team
- Photos start in Unsorted inbox
