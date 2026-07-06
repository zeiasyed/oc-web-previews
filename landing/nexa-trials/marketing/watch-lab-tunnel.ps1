#Requires -Version 5.1
# Health-check lab demos + Cloudflare tunnel; restart anything down.
# Runs every 5 min via register-lab-watchdog.ps1 (Windows Scheduled Task).
#
# Usage:
#   .\watch-lab-tunnel.ps1
#   .\watch-lab-tunnel.ps1 -Quiet

param(
  [switch]$Quiet
)

$ErrorActionPreference = "Continue"
$MarketingRoot = $PSScriptRoot
$LogFile = Join-Path $MarketingRoot "lab-watchdog.log"
$MaxLogLines = 500

function Write-Log([string]$Msg, [string]$Level = "INFO") {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Msg"
  Add-Content -Path $LogFile -Value $line -Encoding utf8
  if (-not $Quiet) {
    $color = switch ($Level) { "OK" { "Green" } "WARN" { "Yellow" } "FAIL" { "Red" } default { "Gray" } }
    Write-Host $line -ForegroundColor $color
  }
}

function Test-HealthUrl([string]$Url) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
    if ($r.StatusCode -ne 200) { return $false }
    return ($r.Content -match '"ok"\s*:\s*true')
  } catch {
    return $false
  }
}

function Test-PortListen([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Trim-Log {
  if (-not (Test-Path $LogFile)) { return }
  $lines = Get-Content $LogFile -ErrorAction SilentlyContinue
  if ($lines.Count -gt $MaxLogLines) {
    $lines | Select-Object -Last $MaxLogLines | Set-Content $LogFile -Encoding utf8
  }
}

Trim-Log

$checks = @(
  @{ Name = "local-direct";  Url = "http://127.0.0.1:5070/health" }
  @{ Name = "local-source";  Url = "http://127.0.0.1:5050/health" }
  @{ Name = "public-direct"; Url = "https://demo-direct.nexa-trials.com/health" }
  @{ Name = "public-source"; Url = "https://demo-source.nexa-trials.com/health" }
)

$failed = @()
foreach ($c in $checks) {
  if (Test-HealthUrl $c.Url) {
    Write-Log "$($c.Name) OK" "OK"
  } else {
    Write-Log "$($c.Name) FAIL $($c.Url)" "FAIL"
    $failed += $c.Name
  }
}

$tunnelUp = [bool](Get-Process cloudflared -ErrorAction SilentlyContinue)
if ($tunnelUp) {
  Write-Log "cloudflared process running" "OK"
} else {
  Write-Log "cloudflared process not running" "FAIL"
  $failed += "cloudflared"
}

$portsOk = (Test-PortListen 5070) -and (Test-PortListen 5050) -and (Test-PortListen 5071) -and (Test-PortListen 5051)
if (-not $portsOk) {
  Write-Log "one or more demo ports not listening (5070/5071/5050/5051)" "FAIL"
  if ("ports" -notin $failed) { $failed += "ports" }
}

if ($failed.Count -eq 0) {
  if (-not $Quiet) { Write-Log "all checks passed" "OK" }
  exit 0
}

Write-Log "repair started (failed: $($failed -join ', '))" "WARN"

& (Join-Path $MarketingRoot "start-lab-background.ps1")
Start-Sleep -Seconds 8

# Public 502 with local OK often means tunnel ingress still uses localhost/IPv6
$localDirect = Test-HealthUrl "http://127.0.0.1:5070/health"
$publicDirect = Test-HealthUrl "https://demo-direct.nexa-trials.com/health"
if ($localDirect -and -not $publicDirect) {
  Write-Log "local OK but public direct FAIL - fixing tunnel ingress" "WARN"
  try {
    & (Join-Path $MarketingRoot "fix-tunnel-localhost.ps1") | Out-Null
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    & (Join-Path $MarketingRoot "start-lab-background.ps1")
    Start-Sleep -Seconds 6
  } catch {
    Write-Log "fix-tunnel-localhost failed: $($_.Exception.Message)" "FAIL"
  }
}

$stillFailed = @()
foreach ($c in $checks) {
  if (-not (Test-HealthUrl $c.Url)) { $stillFailed += $c.Name }
}
if ($stillFailed.Count -eq 0) {
  Write-Log "repair succeeded" "OK"
  exit 0
}

Write-Log "repair incomplete still failing: $($stillFailed -join ', ')" "FAIL"
exit 1
