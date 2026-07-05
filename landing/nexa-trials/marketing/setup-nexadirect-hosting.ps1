#Requires -Version 5.1
# One-time NexaDirect 24/7 hosting setup (Render + Cloudflare DNS).
# Opens Render blueprint deploy, then wires demo-direct.nexa-trials.com when ready.

param(
  [string]$RenderApiKey,
  [string]$RenderServiceUrl
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$DemoRoot = Join-Path (Split-Path $Root -Parent) "nexa-direct-demo"
$RenderKeyFile = Join-Path $Root ".render-api-key.local"
$LabFile = Join-Path $Root ".lab-access.local.json"
$Repo = "https://github.com/zeiasyed/oc-web-previews"

Write-Host "`nNexaDirect 24/7 hosting setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

if (-not $RenderApiKey -and $env:RENDER_API_KEY) { $RenderApiKey = $env:RENDER_API_KEY }
if (-not $RenderApiKey -and (Test-Path $RenderKeyFile)) {
  $RenderApiKey = (Get-Content $RenderKeyFile -Raw).Trim()
}

if (-not $RenderApiKey) {
  Write-Host "`nStep 1 — Deploy on Render (always-on Starter plan recommended)" -ForegroundColor Yellow
  Write-Host "  Opening Render blueprint in your browser..." -ForegroundColor Gray
  Start-Process "https://render.com/deploy?repo=$([uri]::EscapeDataString($Repo))"
  Write-Host @"

  In Render:
    • Approve the blueprint (nexadirect-demo service)
    • Plan: Starter ($7/mo) — never sleeps; required for reliable demos
    • Set env vars:
        LAB_AUTH_USER     = test
        LAB_AUTH_PASSWORD = (from .lab-access.local.json)
    • Wait until deploy status is Live

  Step 2 — Create a Render API key
    • Dashboard → Account Settings → API Keys → Create
    • Save to: $RenderKeyFile
      (single line, starts with rnd_)

"@ -ForegroundColor White
  $entered = Read-Host "Paste Render API key here (or press Enter to skip and run deploy later)"
  if ($entered) {
    $entered.Trim() | Set-Content $RenderKeyFile -NoNewline
    $RenderApiKey = $entered.Trim()
    Write-Host "Saved API key locally (gitignored)." -ForegroundColor Green
  }
}

$deployArgs = @{}
if ($RenderApiKey) { $deployArgs.RenderApiKey = $RenderApiKey }
if ($RenderServiceUrl) { $deployArgs.RenderServiceUrl = $RenderServiceUrl }

& (Join-Path $DemoRoot "deploy-nexadirect-cloud.ps1") @deployArgs
