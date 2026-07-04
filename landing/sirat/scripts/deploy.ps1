# Deploy Sirat to GitHub Pages (gh-pages branch) without cloning the full repo.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

npm run build

$deployDir = Join-Path $env:TEMP "sirat-gh-pages-deploy"
if (Test-Path $deployDir) { Remove-Item -Recurse -Force $deployDir }
New-Item -ItemType Directory -Path $deployDir | Out-Null
Copy-Item -Recurse -Force "dist\*" $deployDir

Set-Location $deployDir
git init
git checkout -b gh-pages
git add -A
git commit -m "Deploy Sirat app $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git remote remove origin 2>$null
git remote add origin https://github.com/zeiasyed/oc-web-previews.git
git push -f origin gh-pages

Write-Host ""
Write-Host "Deployed to gh-pages branch."
Write-Host "Public URL: https://zeiasyed.github.io/oc-web-previews/landing/sirat/"
Write-Host "If first deploy, enable Pages at: https://github.com/zeiasyed/oc-web-previews/settings/pages"
