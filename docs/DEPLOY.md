# Deploy to GitHub Pages

Git is not available in your current shell PATH. Install [Git for Windows](https://git-scm.com/download/win), then:

## 1. Create the private repo on GitHub

1. Go to https://github.com/new
2. Repository name: `oc-web-previews`
3. Visibility: **Private**
4. Do **not** add README (we already have one)

## 2. Update branding before deploy

Edit `config/branding.json`:

- `github_pages_base` → `https://YOUR_USERNAME.github.io/oc-web-previews`
- Replace `REPLACE_WITH_YOUR_*` contact fields with real info

Then run:

```powershell
python scripts/sync_branding.py
python scripts/generate_postcards.py
```

## 3. Push the project

```powershell
cd "c:\Users\zeias\Documents\Website Development\oc-web-previews"
git init
git add -A
git commit -m "Pilot: OC Web Co preview outreach tooling and sample site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/oc-web-previews.git
git push -u origin main
```

## 4. Enable GitHub Pages

1. Repo → **Settings** → **Pages**
2. Source: **GitHub Actions** (workflow already included)
3. After the deploy workflow finishes, your live URLs will be:

- Hub: `https://YOUR_USERNAME.github.io/oc-web-previews/`
- Connect: `https://YOUR_USERNAME.github.io/oc-web-previews/landing/connect.html?biz=SLUG`
- Preview: `https://YOUR_USERNAME.github.io/oc-web-previews/previews/SLUG/`

## 5. Test QR codes

Open the postcard PNG from `postcards/png/` and scan with your phone after deploy.

Sample slug for pilot review:

`community-collision-center-of-santa-margarita-rancho-santa-m`
