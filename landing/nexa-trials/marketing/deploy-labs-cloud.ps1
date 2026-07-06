#Requires -Version 5.1
# Deploy both lab demos to Render (24/7) and repoint Cloudflare DNS away from PC tunnel.
#
# Prereqs (one-time):
#   1. Render API key -> nexa-trials\.render-api-key.local  (Dashboard -> Account -> API Keys)
#   2. Push this repo to GitHub main (Render builds from Git)
#
# Usage:
#   .\deploy-labs-cloud.ps1
#   .\deploy-labs-cloud.ps1 -RenderApiKey "rnd_..."
#   .\deploy-labs-cloud.ps1 -DnsOnly -RenderServiceUrlDirect ... -RenderServiceUrlSource ...

param(
  [string]$RenderApiKey,
  [string]$RenderServiceUrlDirect,
  [string]$RenderServiceUrlSource,
  [switch]$DnsOnly
)

$ErrorActionPreference = "Stop"
$MarketingRoot = $PSScriptRoot
$LandingRoot = Split-Path $MarketingRoot -Parent | Split-Path -Parent
$DirectRoot = Join-Path $LandingRoot "nexa-direct-demo"
$SourceRoot = Join-Path $LandingRoot "nexa-source-flow-demo"

$common = @{}
if ($RenderApiKey) { $common.RenderApiKey = $RenderApiKey }
if ($DnsOnly) { $common.DnsOnly = $true }

Write-Host "=== NexaDirect cloud deploy ===" -ForegroundColor Cyan
$directArgs = @{} + $common
if ($RenderServiceUrlDirect) { $directArgs.RenderServiceUrl = $RenderServiceUrlDirect }
& (Join-Path $DirectRoot "deploy-nexadirect-cloud.ps1") @directArgs
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== NexaSource cloud deploy ===" -ForegroundColor Cyan
$sourceArgs = @{} + $common
if ($RenderServiceUrlSource) { $sourceArgs.RenderServiceUrl = $RenderServiceUrlSource }
& (Join-Path $SourceRoot "deploy-nexasource-cloud.ps1") @sourceArgs
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Both lab demos are configured for 24/7 hosting on Render." -ForegroundColor Green
Write-Host "Stop run-all-labs.ps1 and cloudflared on your PC — DNS no longer depends on it." -ForegroundColor Yellow
Write-Host "Gateway: https://nexa-trials.com/lab/" -ForegroundColor Green
