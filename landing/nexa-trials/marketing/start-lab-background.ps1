#Requires -Version 5.1
# Start NexaDirect + NexaSource + cloudflared without blocking (for watchdog / background use).

$ErrorActionPreference = "Stop"
$MarketingRoot = $PSScriptRoot
$TrialsRoot = Split-Path $MarketingRoot -Parent
$DirectRoot = Join-Path (Split-Path $TrialsRoot -Parent) "nexa-direct-demo"
$SourceRoot = Join-Path (Split-Path $TrialsRoot -Parent) "nexa-source-flow-demo"
$TunnelTokenFile = Join-Path $TrialsRoot ".cloudflare-tunnel.local.json"
$labCredsFile = Join-Path $TrialsRoot ".lab-access.local.json"
$Cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

if (-not (Test-Path $TunnelTokenFile)) { throw "Missing $TunnelTokenFile" }
if (-not (Test-Path $Cloudflared)) { throw "Missing cloudflared: $Cloudflared" }

$lab = if (Test-Path $labCredsFile) { Get-Content $labCredsFile -Raw | ConvertFrom-Json } else { $null }

function Test-PortListen([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-AppIfDown([string]$Py, [string]$Script, [string]$WorkDir, [hashtable]$EnvVars) {
  foreach ($key in $EnvVars.Keys) { Set-Item -Path "Env:$key" -Value $EnvVars[$key] }
  if (-not (Test-Path $Py)) { throw "Missing $Py" }
  Start-Process -FilePath $Py -ArgumentList $Script -WorkingDirectory $WorkDir -WindowStyle Hidden
}

# NexaDirect
$directPy = Join-Path $DirectRoot ".venv\Scripts\python.exe"
$directEnv = @{
  LAB_AUTH_USER     = $lab.user
  LAB_AUTH_PASSWORD = $lab.password
  NEXA_ASSETS_DIR   = Join-Path $DirectRoot "demo_data\nexa_assets"
  EDC_PUBLIC_BASE   = "https://demo-edc.nexa-trials.com"
}
if (-not (Test-PortListen 5071)) {
  Remove-Item Env:SCRIPT_ROOT -ErrorAction SilentlyContinue
  Start-AppIfDown $directPy "mock_rave\app.py" $DirectRoot $directEnv
  Start-Sleep -Seconds 1
}
if (-not (Test-PortListen 5070)) {
  Remove-Item Env:SCRIPT_ROOT -ErrorAction SilentlyContinue
  Start-AppIfDown $directPy "console\app.py" $DirectRoot $directEnv
  Start-Sleep -Seconds 1
}

# NexaSource
$sourcePy = Join-Path $SourceRoot ".venv\Scripts\python.exe"
$sourceEnv = @{ EDC_PUBLIC_BASE = "https://demo-source-edc.nexa-trials.com" }
if (-not (Test-PortListen 5051)) {
  Remove-Item Env:SCRIPT_ROOT -ErrorAction SilentlyContinue
  Start-AppIfDown $sourcePy "mock_rave\app.py" $SourceRoot $sourceEnv
  Start-Sleep -Seconds 1
}
if (-not (Test-PortListen 5050)) {
  Remove-Item Env:SCRIPT_ROOT -ErrorAction SilentlyContinue
  Start-AppIfDown $sourcePy "console\app.py" $SourceRoot $sourceEnv
  Start-Sleep -Seconds 1
}

if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
  $tunnel = Get-Content $TunnelTokenFile -Raw | ConvertFrom-Json
  Start-Process -FilePath $Cloudflared -ArgumentList @("tunnel", "run", "--token", $tunnel.token) -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
