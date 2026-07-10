#Requires -Version 5.1
# Expose NexaSource (NexaFlow sync) via Cloudflare Tunnel — demo-source.nexa-trials.com

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$tunnelTokenFile = Join-Path (Split-Path $root -Parent) "nexa-trials\.cloudflare-tunnel.local.json"
$labCredsFile = Join-Path (Split-Path $root -Parent) "nexa-trials\.lab-access.local.json"

if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Run .\setup.ps1 first." -ForegroundColor Red
  exit 1
}

$py = Join-Path $root ".venv\Scripts\python.exe"
$tunnel = Get-Content $tunnelTokenFile -Raw | ConvertFrom-Json
$lab = if (Test-Path $labCredsFile) { Get-Content $labCredsFile -Raw | ConvertFrom-Json } else { $null }

$env:LAB_AUTH_USER = if ($lab.user) { $lab.user } else { "test" }
$env:LAB_AUTH_PASSWORD = if ($lab.password) { $lab.password } else { "" }
$env:EDC_PUBLIC_BASE = "https://demo-source-edc.nexa-trials.com"
$env:NEXA_ASSETS_DIR = $null
$env:BIND_HOST = "127.0.0.1"
$env:CONSOLE_PORT = "5050"
$env:RAVE_PORT = "5051"

function Stop-DemoPort($port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Write-Host "Stopping old NexaSource processes on 5050/5051..." -ForegroundColor Gray
Stop-DemoPort 5051
Stop-DemoPort 5050
Start-Sleep -Seconds 2

Remove-Item Env:SCRIPT_ROOT -ErrorAction SilentlyContinue
$env:EDC_PUBLIC_BASE = "https://demo-source-edc.nexa-trials.com"
Write-Host "Starting Mock EDC on 5051..." -ForegroundColor Cyan
Start-Process -FilePath $py -ArgumentList "mock_rave\app.py" -WorkingDirectory $root -WindowStyle Minimized
Start-Sleep -Seconds 1

Write-Host "Starting NexaSource console on 5050..." -ForegroundColor Cyan
Start-Process -FilePath $py -ArgumentList "console\app.py" -WorkingDirectory $root -WindowStyle Minimized
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Console:  https://demo-source.nexa-trials.com/" -ForegroundColor Green
Write-Host "Mock EDC: https://demo-source-edc.nexa-trials.com/" -ForegroundColor Green
Write-Host "Gateway:  https://nexa-trials.com/lab/" -ForegroundColor Green
Write-Host ""
Write-Host "Note: run nexa-direct-demo\run_lab_tunnel.ps1 in another window for NexaDirect." -ForegroundColor Yellow
Write-Host "Or use run-all-labs.ps1 in nexa-trials\marketing to start both + tunnel." -ForegroundColor Yellow
