# Deploy — ReNu California Photo Extractor

Isolated from `landing/ari-photo-extractor/` (Texas). Never point one UI at the other API.

## One-command deploy

```powershell
cd landing/renu-california-photo-extractor
.\deploy.ps1 -AriEmail "zeia.renucar@gmail.com" -AriPassword "YOUR_ARI_PASSWORD"
```

Optional: `-ShopPassword`, `-SkipGit`, `-DefaultUserName`.

Requires Cloudflare credentials at `landing/toledo-swift-haul-dashboard/.cloudflare-credentials.json`.

## After deploy

1. Open **https://renu-california-photo-extractor-api.zeiasyed.workers.dev**
2. Sign in: name `California`, shop password (default `renucalifornia`)
3. **ARI settings** — if imports fail, complete Step 1 (email pre-filled) and your user passcode if the account has sub-users

## GitHub Pages

`deploy.ps1` copies `app/` to `gh-pages/` with the California API URL baked in. Push with git or use `-SkipGit` and push manually.
