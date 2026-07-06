#Requires -Version 5.1
# Create Oracle Always Free Ampere VM + open ports 22/80, then call deploy-labs-vps.ps1.
#
# Prereqs (one-time, ~10 min in Oracle console):
#   1. Oracle Cloud free account: https://www.oracle.com/cloud/free/
#   2. OCI CLI config on this PC:
#        winget install Oracle.OCI.CLI
#        oci setup config
#   3. Copy oracle-oci.local.json.example -> nexa-trials\.oracle-oci.local.json
#      Fill compartmentId, subnetId, availabilityDomain, imageId (Ubuntu 22.04 aarch64).
#
# Usage:
#   .\provision-oracle-labs.ps1
#   .\provision-oracle-labs.ps1 -SkipProvision -VpsIp 150.136.x.x

param(
  [string]$VpsIp,
  [string]$SshKey = "$env:USERPROFILE\.ssh\nexa-labs_ed25519",
  [switch]$SkipProvision
)

$ErrorActionPreference = "Stop"
$MarketingRoot = $PSScriptRoot
$TrialsRoot = Split-Path $MarketingRoot -Parent
$OciConfigFile = Join-Path $TrialsRoot ".oracle-oci.local.json"
$StateFile = Join-Path $TrialsRoot ".nexa-labs-vps-state.json"

function Write-Step([string]$Msg) { Write-Host "`n>> $Msg" -ForegroundColor Cyan }
function Write-Ok([string]$Msg) { Write-Host "   OK  $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg) { Write-Host "   !!  $Msg" -ForegroundColor Yellow }

function Ensure-SshKey {
  if (Test-Path $SshKey) { return }
  $pub = "$SshKey.pub"
  Write-Step "Generating SSH key at $SshKey"
  New-Item -ItemType Directory -Force -Path (Split-Path $SshKey) | Out-Null
  & ssh-keygen -t ed25519 -f $SshKey -N '""' -C "nexa-labs-vps"
  if ($LASTEXITCODE -ne 0) { throw "ssh-keygen failed" }
  Write-Ok "Created $pub"
}

function Get-Oci {
  $oci = Get-Command oci -ErrorAction SilentlyContinue
  if (-not $oci) {
    Write-Warn "OCI CLI not found. Install: winget install Oracle.OCI.CLI"
    Write-Warn "Then run: oci setup config"
    throw "Missing oci command"
  }
  return $oci.Source
}

function Invoke-Oci {
  param([string[]]$Args)
  $out = & oci @Args --output json 2>&1
  if ($LASTEXITCODE -ne 0) { throw "oci $($Args -join ' ') failed: $out" }
  return $out | ConvertFrom-Json
}

function Open-SecurityListPorts {
  param([string]$SubnetId, [string]$Region)
  Write-Step "Opening security list ports 22 and 80"
  $subnet = Invoke-Oci @("network", "subnet", "get", "--subnet-id", $SubnetId, "--region", $Region)
  $slId = $subnet.data."security-list-ids"[0]
  $sl = Invoke-Oci @("network", "security-list", "get", "--security-list-id", $slId, "--region", $Region)
  $ingress = @($sl.data."ingress-security-rules")
  $needed = @(
    @{ protocol = "6"; source = "0.0.0.0/0"; tcp = @{ destinationPortRange = @{ min = 22; max = 22 } } }
    @{ protocol = "6"; source = "0.0.0.0/0"; tcp = @{ destinationPortRange = @{ min = 80; max = 80 } } }
  )
  foreach ($rule in $needed) {
    $port = $rule.tcp.destinationPortRange.min
    $exists = $ingress | Where-Object {
      $_.source -eq "0.0.0.0/0" -and $_.protocol -eq "6" -and
      $_.tcpOptions.destinationPortRange.min -eq $port
    }
    if (-not $exists) { $ingress += $rule }
  }
  $payload = @{ ingressSecurityRules = $ingress; egressSecurityRules = $sl.data."egress-security-rules" } | ConvertTo-Json -Depth 10
  $tmp = [System.IO.Path]::GetTempFileName()
  Set-Content -Path $tmp -Value $payload -Encoding utf8
  & oci network security-list update --security-list-id $slId --region $Region --ingress-security-rules file://$tmp --force 2>&1 | Out-Null
  Remove-Item $tmp -Force
  Write-Ok "Security list updated"
}

function Wait-InstancePublicIp {
  param([string]$InstanceId, [string]$Region)
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 10
    $vnicAtt = Invoke-Oci @("compute", "vnic-attachment", "list", "--compartment-id", $script:CompartmentId, "--instance-id", $InstanceId, "--region", $Region)
    $vnicId = $vnicAtt.data[0]."vnic-id"
    if (-not $vnicId) { continue }
    $vnic = Invoke-Oci @("network", "vnic", "get", "--vnic-id", $vnicId, "--region", $Region)
    $ip = $vnic.data."public-ip"
    if ($ip) { return $ip }
  }
  throw "Timed out waiting for public IP"
}

Ensure-SshKey

if (-not $SkipProvision) {
  if (-not (Test-Path $OciConfigFile)) {
    Write-Warn "Missing $OciConfigFile"
    Write-Host @"

Create Oracle free account, then in the console:
  1. Networking -> Virtual cloud networks -> your VCN -> Subnet -> copy Subnet OCID
  2. Compute -> Instances -> Create -> pick Ubuntu 22.04 aarch64 -> copy Image OCID from image details
  3. Identity -> Compartments -> copy Compartment OCID
  4. Availability domain: oci iam availability-domain list

Copy lab-vps\oracle-oci.local.json.example to nexa-trials\.oracle-oci.local.json and fill values.
Run: oci setup config

Then re-run: .\provision-oracle-labs.ps1
"@ -ForegroundColor Yellow
    exit 1
  }

  Get-Oci | Out-Null
  $cfg = Get-Content $OciConfigFile -Raw | ConvertFrom-Json
  $script:CompartmentId = $cfg.compartmentId
  $region = $cfg.region
  $pubKeyPath = $cfg.sshPublicKeyPath -replace '%USERPROFILE%', $env:USERPROFILE
  $pubKey = (Get-Content $pubKeyPath -Raw).Trim()

  if ((Test-Path $StateFile) -and -not $VpsIp) {
    $state = Get-Content $StateFile -Raw | ConvertFrom-Json
    if ($state.instanceId -and $state.publicIp) {
      Write-Ok "Reusing instance $($state.instanceId) at $($state.publicIp)"
      $VpsIp = $state.publicIp
    }
  }

  if (-not $VpsIp) {
    Open-SecurityListPorts -SubnetId $cfg.subnetId -Region $region

    Write-Step "Launching Oracle Ampere instance (nexa-labs)"
    $meta = @{ ssh_authorized_keys = $pubKey } | ConvertTo-Json -Compress
    $shapeConfig = '{"ocpus":2,"memoryInGBs":12}'
    $launch = Invoke-Oci @(
      "compute", "instance", "launch",
      "--availability-domain", $cfg.availabilityDomain,
      "--compartment-id", $cfg.compartmentId,
      "--shape", "VM.Standard.A1.Flex",
      "--shape-config", $shapeConfig,
      "--image-id", $cfg.imageId,
      "--subnet-id", $cfg.subnetId,
      "--display-name", "nexa-labs",
      "--assign-public-ip", "true",
      "--metadata", $meta,
      "--region", $region
    )
    $instanceId = $launch.data.id
    Write-Ok "Instance created: $instanceId"

    Write-Step "Waiting for public IP"
    $VpsIp = Wait-InstancePublicIp -InstanceId $instanceId -Region $region
    Write-Ok "Public IP: $VpsIp"

    @{ instanceId = $instanceId; publicIp = $VpsIp; region = $region; createdAt = (Get-Date).ToString("o") } |
      ConvertTo-Json | Set-Content -Path $StateFile -Encoding utf8
  }
}

if (-not $VpsIp) { throw "No VPS IP — provision failed or pass -VpsIp" }

Write-Step "Waiting for SSH on $VpsIp"
$sshArgs = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-i", $SshKey)
for ($i = 0; $i -lt 30; $i++) {
  & ssh @sshArgs "ubuntu@${VpsIp}" "echo ok" 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 10
  if ($i -eq 29) { throw "SSH not reachable on $VpsIp" }
}
Write-Ok "SSH ready"

Write-Step "Deploying Nexa labs to VPS"
& (Join-Path $MarketingRoot "deploy-labs-vps.ps1") -VpsIp $VpsIp -SshUser ubuntu -SshKey $SshKey
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Nexa labs are live on Oracle free tier at $VpsIp" -ForegroundColor Green
