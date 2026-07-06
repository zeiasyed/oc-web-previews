#Requires -Version 5.1
# Deploy both lab demos to a free/cheap VPS (Oracle Always Free, etc.) and point
# Cloudflare DNS at the VM public IP — no PC tunnel, no Render bill.
#
# Prereqs:
#   1. Ubuntu VM with SSH (see lab-vps/ORACLE-SETUP.md)
#   2. Cloudflare credentials -> nexa-trials\.cloudflare-credentials.json
#   3. Lab password -> nexa-trials\.lab-access.local.json
#   4. Push this repo to GitHub main (VPS clones from there)
#
# Usage:
#   .\deploy-labs-vps.ps1 -VpsIp 150.136.x.x
#   .\deploy-labs-vps.ps1 -VpsIp 150.136.x.x -SshUser ubuntu -SshKey $env:USERPROFILE\.ssh\id_rsa
#   .\deploy-labs-vps.ps1 -VpsIp 150.136.x.x -DnsOnly
#   .\deploy-labs-vps.ps1 -VpsIp 150.136.x.x -BootstrapOnly   # first SSH + setup only, skip DNS

param(
  [Parameter(Mandatory = $true)]
  [string]$VpsIp,
  [string]$SshUser = "ubuntu",
  [string]$SshKey = "",
  [string]$Repo = "https://github.com/zeiasyed/oc-web-previews.git",
  [string]$Branch = "main",
  [string]$InstallRoot = "/opt/nexa-labs",
  [switch]$DnsOnly,
  [switch]$BootstrapOnly
)

$ErrorActionPreference = "Stop"
$MarketingRoot = $PSScriptRoot
$TrialsRoot = Split-Path $MarketingRoot -Parent
$LabVpsDir = Join-Path $MarketingRoot "lab-vps"
$CredsFile = Join-Path $TrialsRoot ".cloudflare-credentials.json"
$LabFile = Join-Path $TrialsRoot ".lab-access.local.json"
$ZoneName = "nexa-trials.com"

$LabHosts = @(
  "demo-direct",
  "demo-edc",
  "demo-source",
  "demo-source-edc"
)

function Write-Step([string]$Msg) { Write-Host "`n>> $Msg" -ForegroundColor Cyan }
function Write-Ok([string]$Msg) { Write-Host "   OK  $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg) { Write-Host "   !!  $Msg" -ForegroundColor Yellow }

function Get-SshBaseArgs {
  $args = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new")
  if ($SshKey -and (Test-Path $SshKey)) {
    $args += @("-i", $SshKey)
  }
  return $args
}

function Invoke-Ssh([string]$RemoteCommand) {
  $target = "${SshUser}@${VpsIp}"
  $base = Get-SshBaseArgs
  & ssh @base $target $RemoteCommand
  if ($LASTEXITCODE -ne 0) {
    throw "SSH failed (exit $LASTEXITCODE): $RemoteCommand"
  }
}

function Invoke-Scp([string]$LocalPath, [string]$RemotePath) {
  $target = "${SshUser}@${VpsIp}:$RemotePath"
  $base = Get-SshBaseArgs
  & scp @base $LocalPath $target
  if ($LASTEXITCODE -ne 0) {
    throw "SCP failed: $LocalPath -> $RemotePath"
  }
}

function Get-CfHeaders {
  param($Creds)
  if ($Creds.type -eq "token") { return @{ Authorization = "Bearer $($Creds.token)" } }
  return @{ "X-Auth-Email" = $Creds.email; "X-Auth-Key" = $Creds.globalKey }
}

function Set-CfARecord {
  param(
    [string]$RecordName,
    [string]$Ip,
    [hashtable]$Headers,
    [string]$Zone
  )
  $fqdn = "$RecordName.$ZoneName"
  $records = (Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$Zone/dns_records?name=$fqdn" -Headers $Headers).result
  $payload = @{
    type    = "A"
    name    = $RecordName
    content = $Ip
    proxied = $true
    ttl     = 1
  }
  if ($records -and $records.Count -gt 0) {
    $null = Invoke-RestMethod -Method PUT -Uri "https://api.cloudflare.com/client/v4/zones/$Zone/dns_records/$($records[0].id)" -Headers $Headers -ContentType "application/json" -Body ($payload | ConvertTo-Json)
    Write-Ok "Updated $fqdn -> $Ip (proxied)"
  } else {
    $null = Invoke-RestMethod -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$Zone/dns_records" -Headers $Headers -ContentType "application/json" -Body ($payload | ConvertTo-Json)
    Write-Ok "Created $fqdn -> $Ip (proxied)"
  }
}

# --- lab credentials ---
$lab = if (Test-Path $LabFile) { Get-Content $LabFile -Raw | ConvertFrom-Json } else { $null }
$labUser = if ($lab.user) { $lab.user } else { "test" }
$labPass = if ($lab.password) { $lab.password } else { "" }
if (-not $labPass -and -not $DnsOnly) {
  Write-Warn "No password in $LabFile — set LAB_AUTH_PASSWORD on the VPS .env manually."
}

if (-not $DnsOnly) {
  Write-Step "SSH: upload .env and run setup-vps.sh on $VpsIp"
  $envPath = Join-Path $env:TEMP "nexa-labs.env"
  @(
    "LAB_AUTH_USER=$labUser"
    "LAB_AUTH_PASSWORD=$labPass"
    "LAB_AUTH_EDC=1"
    "NEXA_LABS_DATA=/opt/nexa-labs/data"
  ) | Set-Content -Path $envPath -Encoding utf8NoBOM

  Invoke-Scp $envPath "/tmp/nexa-labs.env"

  $setupLocal = Join-Path $LabVpsDir "setup-vps.sh"
  Invoke-Scp $setupLocal "/tmp/nexa-setup-vps.sh"
  Invoke-Ssh "sudo chmod +x /tmp/nexa-setup-vps.sh && sudo INSTALL_ROOT=$InstallRoot REPO_URL=$Repo BRANCH=$Branch bash /tmp/nexa-setup-vps.sh"

  Remove-Item $envPath -Force -ErrorAction SilentlyContinue
  Write-Ok "VPS bootstrap complete"
}

if ($BootstrapOnly) {
  Write-Warn "BootstrapOnly — skipped Cloudflare DNS. Re-run without -BootstrapOnly when ready."
  exit 0
}

if (-not (Test-Path $CredsFile)) {
  throw "Missing Cloudflare credentials: $CredsFile"
}
$cf = Get-Content $CredsFile -Raw | ConvertFrom-Json
$cfHeaders = Get-CfHeaders $cf
$zoneId = (Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones?name=$ZoneName" -Headers $cfHeaders).result[0].id
if (-not $zoneId) { throw "Cloudflare zone not found: $ZoneName" }

Write-Step "Cloudflare DNS: lab hosts -> $VpsIp"
foreach ($name in $LabHosts) {
  Set-CfARecord -RecordName $name -Ip $VpsIp -Headers $cfHeaders -Zone $zoneId
}

Write-Step "Verify public health (may take ~30s for DNS)"
Start-Sleep -Seconds 8
foreach ($hostName in @("demo-direct", "demo-source")) {
  $url = "https://$hostName.$ZoneName/health"
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 45
    if ($r.StatusCode -eq 200) {
      Write-Ok "$url -> $($r.Content)"
    }
  } catch {
    Write-Warn "$url not ready yet: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "Nexa labs (24/7 on VPS — free tier):" -ForegroundColor Green
Write-Host "  https://demo-direct.$ZoneName/" -ForegroundColor Green
Write-Host "  https://demo-source.$ZoneName/" -ForegroundColor Green
Write-Host "  Mock EDC Direct: https://demo-direct.$ZoneName/edc/" -ForegroundColor Green
Write-Host "  Mock EDC Source: https://demo-source.$ZoneName/edc/" -ForegroundColor Green
Write-Host "  Gateway:         https://$ZoneName/lab/" -ForegroundColor Green
Write-Host "  Auth:            $labUser / (from .lab-access.local.json)" -ForegroundColor Green
Write-Host ""
Write-Warn "Stop run-all-labs.ps1 and cloudflared on your PC — DNS now points at the VPS."
Write-Host "Updates: git push main, then ssh and run update-labs.sh (or re-run this script)." -ForegroundColor Gray
