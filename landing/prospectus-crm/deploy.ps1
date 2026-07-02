# Deploy Prospectus CRM to GitHub Pages (static files only)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $Root "app"

Write-Host "Prospectus CRM app is at: $App"
Write-Host ""
Write-Host "Local preview:"
Write-Host "  cd `"$App`""
Write-Host "  python -m http.server 8080"
Write-Host ""
Write-Host "GitHub Pages URL:"
Write-Host "  https://zeiasyed.github.io/oc-web-previews/landing/prospectus-crm/app/"
Write-Host ""
Write-Host "Commit and push the prospectus-crm folder to deploy."
