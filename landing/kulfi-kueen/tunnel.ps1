# Public preview link for iPhone (works on Wi-Fi or cellular, no firewall changes)
$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cf)) {
  Write-Host "cloudflared not found. Run: winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "  Starting public preview tunnel..." -ForegroundColor Magenta
Write-Host "  (Keep this window open. Copy the https://....trycloudflare.com URL for your phone.)" -ForegroundColor DarkGray
Write-Host ""

& $cf tunnel --url http://localhost:5500
