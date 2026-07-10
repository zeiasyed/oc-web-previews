#Requires -Version 5.1
# Cheapest stable path: Oracle Always Free VPS ($0/mo) for both lab demos.
#
# Usage:
#   .\go-live-free.ps1                    # open Oracle signup + show SSH key
#   .\go-live-free.ps1 -VpsIp 150.136.x.x # deploy after VM exists
#   .\go-live-free.ps1 -FinishOnly        # DNS cutover + stop PC tunnel (VM already running)

param(
  [string]$VpsIp,
  [switch]$FinishOnly
)

$ErrorActionPreference = "Stop"
$MarketingRoot = $PSScriptRoot
$TrialsRoot = Split-Path $MarketingRoot -Parent
$SshKey = "$env:USERPROFILE\.ssh\nexa-labs_ed25519"
$SshPub = "$SshKey.pub"
$OciConfig = Join-Path $TrialsRoot ".oracle-oci.local.json"
$SetupDoc = Join-Path $MarketingRoot "lab-vps\ORACLE-SETUP.md"

function Write-Step([string]$Msg) { Write-Host "`n>> $Msg" -ForegroundColor Cyan }
function Write-Ok([string]$Msg) { Write-Host "   OK  $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg) { Write-Host "   !!  $Msg" -ForegroundColor Yellow }

function Ensure-SshKey {
  if (Test-Path $SshKey) { return }
  Write-Step "Generating SSH key"
  New-Item -ItemType Directory -Force -Path (Split-Path $SshKey) | Out-Null
  & ssh-keygen -t ed25519 -f $SshKey -N '""' -C "nexa-labs-vps"
  if ($LASTEXITCODE -ne 0) { throw "ssh-keygen failed" }
  Write-Ok "Created $SshPub"
}

function Stop-PcTunnel {
  Write-Step "Stopping PC tunnel (no longer needed after VPS cutover)"
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  foreach ($port in 5050, 5051, 5070, 5071) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
  Write-Ok "PC tunnel processes stopped"
}

function Show-OracleQuickStart {
  Ensure-SshKey
  $pub = Get-Content $SshPub -Raw
  Set-Clipboard -Value $pub.Trim()
  Write-Step "Oracle Always Free - one-time setup (~15 min)"
  $lines = @(
    "1. Sign up (free): https://www.oracle.com/cloud/free/"
    "2. Console: Compute -> Instances -> Create instance"
    "   - Name: nexa-labs"
    "   - Image: Ubuntu 22.04 or 24.04 (aarch64)"
    "   - Shape: VM.Standard.A1.Flex - 2 OCPU, 12 GB RAM"
    "   - Paste SSH key (already copied to clipboard):"
    "     $pub"
    "   - Assign public IPv4"
    "3. Networking -> Security list -> add ingress TCP 22 and 80 from 0.0.0.0/0"
    "4. Wait until Running, copy the public IP."
    ""
    "Then run:"
    "  .\go-live-free.ps1 -VpsIp <PUBLIC_IP>"
    ""
    "Full guide: $SetupDoc"
  )
  $lines | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
  Start-Process "https://cloud.oracle.com/compute/instances/create"
}

if (-not $VpsIp -and -not $FinishOnly) {
  if (Test-Path (Join-Path $TrialsRoot ".nexa-labs-vps-state.json")) {
    $state = Get-Content (Join-Path $TrialsRoot ".nexa-labs-vps-state.json") -Raw | ConvertFrom-Json
    if ($state.publicIp) {
      Write-Ok "Found saved VPS IP: $($state.publicIp)"
      $VpsIp = $state.publicIp
    }
  }
}

if (-not $VpsIp -and -not $FinishOnly) {
  if (Test-Path $OciConfig) {
    Write-Step "Oracle config found — trying automated provision"
    & (Join-Path $MarketingRoot "provision-oracle-labs.ps1")
    if ($LASTEXITCODE -eq 0) {
      Stop-PcTunnel
      exit 0
    }
    Write-Warn "Automated provision failed — use manual Oracle console steps below"
  }
  Show-OracleQuickStart
  exit 0
}

if ($FinishOnly -and -not $VpsIp) {
  throw "Pass -VpsIp with -FinishOnly"
}

Write-Step "Deploying NexaFlow + NexaDirect to VPS $VpsIp (15-30 min first run)"
Ensure-SshKey
& (Join-Path $MarketingRoot "deploy-labs-vps.ps1") -VpsIp $VpsIp -SshUser ubuntu -SshKey $SshKey
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Stop-PcTunnel

Write-Step "Final health check"
Start-Sleep -Seconds 5
$ok = $true
foreach ($url in @(
  "https://demo-direct.nexa-trials.com/health",
  "https://demo-source.nexa-trials.com/health"
)) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 45
    if ($r.StatusCode -eq 200 -and $r.Content -match '"ok"\s*:\s*true') {
      Write-Ok $url
    } else {
      Write-Warn "$url unhealthy"
      $ok = $false
    }
  } catch {
    Write-Warn "$url failed: $($_.Exception.Message)"
    $ok = $false
  }
}

if ($ok) {
  Write-Host ""
  Write-Host "Nexa labs are live 24/7 on Oracle free tier — no PC tunnel needed." -ForegroundColor Green
  Write-Host "  https://demo-direct.nexa-trials.com/" -ForegroundColor Green
  Write-Host "  https://demo-source.nexa-trials.com/" -ForegroundColor Green
  Write-Host "  Gateway: https://nexa-trials.com/lab/" -ForegroundColor Green
  Write-Host "  Auth: test / Academy123!" -ForegroundColor Green
} else {
  Write-Warn "Deploy finished but health checks pending — wait 2 min and re-check /health URLs"
}
