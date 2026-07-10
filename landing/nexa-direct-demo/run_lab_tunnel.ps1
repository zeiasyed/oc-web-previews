#Requires -Version 5.1
# DEPRECATED — PC tunnel (not 24/7). Use deploy-nexadirect-cloud.ps1 instead.
# Expose NexaDirect locally via Cloudflare Tunnel (demo-direct.nexa-trials.com).
# Keep this window open while you need public access — traffic routes to this PC.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$tunnelTokenFile = Join-Path (Split-Path $root -Parent) "nexa-trials\.cloudflare-tunnel.local.json"
$labCredsFile = Join-Path (Split-Path $root -Parent) "nexa-trials\.lab-access.local.json"

if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Run .\setup.ps1 first." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $tunnelTokenFile)) {
  Write-Host "Missing $tunnelTokenFile — recreate the Cloudflare tunnel token." -ForegroundColor Red
  exit 1
}

$py = Join-Path $root ".venv\Scripts\python.exe"
$tunnel = Get-Content $tunnelTokenFile -Raw | ConvertFrom-Json
$lab = if (Test-Path $labCredsFile) { Get-Content $labCredsFile -Raw | ConvertFrom-Json } else { $null }

$env:LAB_AUTH_USER = if ($lab.user) { $lab.user } else { "test" }
$env:LAB_AUTH_PASSWORD = if ($lab.password) { $lab.password } else { "" }
$env:EDC_PUBLIC_BASE = "https://demo-edc.nexa-trials.com"
$env:NEXA_ASSETS_DIR = Join-Path $root "demo_data\nexa_assets"
$env:BIND_HOST = "127.0.0.1"
$env:CONSOLE_PORT = "5070"
$env:RAVE_PORT = "5071"

function Stop-DemoPort($port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Write-Host "Stopping old demo/tunnel processes on 5070/5071..." -ForegroundColor Gray
Stop-DemoPort 5071
Stop-DemoPort 5070
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Starting Mock EDC on 5071 (no second login prompt)..." -ForegroundColor Cyan
Remove-Item Env:SCRIPT_ROOT -ErrorAction SilentlyContinue
$env:EDC_PUBLIC_BASE = "https://demo-edc.nexa-trials.com"
Start-Process -FilePath $py -ArgumentList "mock_rave\app.py" -WorkingDirectory $root -WindowStyle Minimized
Start-Sleep -Seconds 1

Write-Host "Starting NexaDirect console on 5070..." -ForegroundColor Cyan
Start-Process -FilePath $py -ArgumentList "console\app.py" -WorkingDirectory $root -WindowStyle Minimized
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Console:  https://demo-direct.nexa-trials.com/" -ForegroundColor Green
Write-Host "Mock EDC: https://demo-edc.nexa-trials.com/ (opens straight into Rave — no extra auth)" -ForegroundColor Green
Write-Host "Auth:     $($env:LAB_AUTH_USER) / (password from .lab-access.local.json)" -ForegroundColor Green
Write-Host ""
Write-Host "Starting Cloudflare tunnel (leave this running)..." -ForegroundColor Cyan

& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run --token $tunnel.token
