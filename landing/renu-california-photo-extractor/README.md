# ReNu California Photo Extractor

Separate deployment from the Texas/Renu **ARI Photo Extractor** — different Worker, D1 database, and URLs. No shared login or data.

## URLs

| App | URL |
|-----|-----|
| **California (Worker — app + API)** | `https://renu-california-photo-extractor-api.zeiasyed.workers.dev` |
| **California (GitHub Pages UI)** | `https://zeiasyed.github.io/oc-web-previews/landing/renu-california-photo-extractor/gh-pages/` |
| Texas / original | `https://ari-photo-extractor-api.zeiasyed.workers.dev` |

## Deploy

From this folder:

```powershell
.\deploy.ps1 -SkipGit `
  -AriEmail "your-ari-email@example.com" `
  -AriPassword "your-ari-password"
```

Shop password defaults to `renucalifornia` (override with `-ShopPassword`). Default app user name: `California`.

**Do not commit ARI passwords.** Pass them only at deploy time.

## California ARI account

Production is seeded for user **California** with the ReNu California ARI shop login configured at deploy. Team members sign in with the California shop password + name `California` (or their own name after ARI is linked per user).
