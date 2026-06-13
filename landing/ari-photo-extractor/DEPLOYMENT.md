# Deploy ARI Photo Extractor

## 1. Cloudflare Worker + D1

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
cd worker

# Log in (required once)
npx wrangler login

# Create D1 database
npx wrangler d1 create ari-photo-extractor
```

Copy the `database_id` from the output into `worker/wrangler.toml` (`REPLACE_WITH_D1_DATABASE_ID`).

```powershell
# Apply schema
npx wrangler d1 execute ari-photo-extractor --remote --file=schema.sql

# Set secrets (pick strong values)
npx wrangler secret put SHOP_PASSWORD
npx wrangler secret put ENCRYPTION_KEY

# Deploy API
npx wrangler deploy
```

Note the Worker URL, e.g. `https://ari-photo-extractor-api.<account>.workers.dev`.

## 2. GitHub Pages (UI)

1. Create repo `ari-photo-extractor` on GitHub.
2. Push this folder (or `app/` as root — see option B).

**Option A — repo root is `app/` contents**

Push only the `app/` folder contents to the repo root, enable Pages → branch `main` → `/ (root)`.

**Option B — monorepo**

Keep `app/` subfolder; in repo Settings → Pages → set folder to `/app`.

3. Open the site and set **API URL** on login to your Worker URL.

## 3. CORS / API URL

The Worker allows all origins (`*`). For production you may restrict `Access-Control-Allow-Origin` to your GitHub Pages URL in `worker/index.js`.

## 4. First use

1. Open GitHub Pages URL.
2. API URL = Worker URL.
3. Shop password = value you set in `SHOP_PASSWORD`.
4. Your name = any team member name (batches are per name).
5. ARI settings → enter ARI login once.
6. New import → create a named batch.

## 5. Troubleshooting

| Problem | Fix |
|---------|-----|
| ARI login failed | Verify email/password; account must be active in ARI |
| No clients in dropdown | Save ARI credentials first; click ARI settings |
| Print shows no cars | Check kept ☑, star ★ one before + one after per car |
| Import returns 0 | Widen date range or clear client filter |

## 6. Security notes

- `SHOP_PASSWORD` protects the team UI.
- ARI passwords are AES-GCM encrypted with `ENCRYPTION_KEY`.
- Do not commit secrets or `.ari-session.json` from the old CLI tool.
