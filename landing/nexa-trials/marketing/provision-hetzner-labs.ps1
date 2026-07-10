#Requires -Version 5.1
# Create cheapest stable Hetzner VPS (~EUR 3.79/mo CAX11 ARM) and return public IP.
#
# Prereqs:
#   API token -> nexa-trials\.hetzner-api-token.local  (one line, from console.hetzner.cloud)
#
# Usage:
#   .\provision-hetzner-labs.ps1
#   .\provision-hetzner-labs.ps1 -ApiToken "..."
#   .\provision-hetzner-labs.ps1 -SkipProvision -VpsIp 1.2.3.4

param(
  [string]$ApiToken,
  [string]$VpsIp,
  [string]$SshKey = "$env:USERPROFILE\.ssh\nexa-labs_ed25519",
  [string]$Location = "",
  [string]$ServerType = "",
  [switch]$SkipProvision
)

$ErrorActionPreference = "Stop"
$MarketingRoot = $PSScriptRoot
$TrialsRoot = Split-Path $MarketingRoot -Parent
$TokenFile = Join-Path $TrialsRoot ".hetzner-api-token.local"
$StateFile = Join-Path $TrialsRoot ".nexa-labs-vps-state.json"
$ApiBase = "https://api.hetzner.cloud/v1"

function Write-Step([string]$Msg) { Write-Host "`n>> $Msg" -ForegroundColor Cyan }
function Write-Ok([string]$Msg) { Write-Host "   OK  $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg) { Write-Host "   !!  $Msg" -ForegroundColor Yellow }

function Ensure-SshKey {
  if (Test-Path $SshKey) { return }
  New-Item -ItemType Directory -Force -Path (Split-Path $SshKey) | Out-Null
  & ssh-keygen -t ed25519 -f $SshKey -N '""' -C "nexa-labs-vps"
  if ($LASTEXITCODE -ne 0) { throw "ssh-keygen failed" }
}

function Invoke-Hetzner {
  param([string]$Method, [string]$Path, [object]$Body)
  $headers = @{
    Authorization = "Bearer $script:Token"
    "Content-Type" = "application/json"
  }
  $uri = "$ApiBase$Path"
  if ($Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body ($Body | ConvertTo-Json -Depth 8)
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
}

Ensure-SshKey

if (-not $SkipProvision) {
  if (-not $ApiToken -and (Test-Path $TokenFile)) {
    $ApiToken = (Get-Content $TokenFile -Raw).Trim()
  }
  if (-not $ApiToken) {
    Write-Host @"

Missing Hetzner API token.

1. Sign up: https://console.hetzner.cloud/
2. Create a project -> Security -> API tokens -> Generate (Read & Write)
3. Save token to:
   $TokenFile
   (single line, no quotes)

Then re-run: .\go-live-paid.ps1

"@ -ForegroundColor Yellow
    Start-Process "https://console.hetzner.cloud/projects"
    exit 1
  }
  $script:Token = $ApiToken
  if (-not (Test-Path $TokenFile)) {
    Set-Content -Path $TokenFile -Value $ApiToken -Encoding utf8NoBOM -NoNewline
  }

  if ((Test-Path $StateFile) -and -not $VpsIp) {
    $state = Get-Content $StateFile -Raw | ConvertFrom-Json
    if ($state.provider -eq "hetzner" -and $state.publicIp) {
      $existing = Invoke-Hetzner GET "/servers/$($state.serverId)"
      if ($existing.server.status -eq "running") {
        Write-Ok "Reusing Hetzner server $($state.serverId) at $($state.publicIp)"
        $VpsIp = $state.publicIp
      }
    }
  }

  if (-not $VpsIp) {
    $pub = (Get-Content "$SshKey.pub" -Raw).Trim()
    Write-Step "Registering SSH key with Hetzner"
    $keys = (Invoke-Hetzner GET "/ssh_keys").ssh_keys
    $key = $keys | Where-Object { $_.name -eq "nexa-labs" } | Select-Object -First 1
    if (-not $key) {
      $key = (Invoke-Hetzner POST "/ssh_keys" @{
        name       = "nexa-labs"
        public_key = $pub
      }).ssh_key
      Write-Ok "SSH key created: $($key.id)"
    } else {
      Write-Ok "SSH key exists: $($key.id)"
    }

    $candidates = @(
      @{ type = "cpx11"; location = "ash" }
      @{ type = "cpx11"; location = "hil" }
      @{ type = "cax11"; location = "hel1" }
      @{ type = "cax11"; location = "fsn1" }
      @{ type = "cpx21"; location = "ash" }
    )
    if ($ServerType -and $Location) {
      $candidates = @(@{ type = $ServerType; location = $Location })
    }

    $server = $null
    foreach ($c in $candidates) {
      Write-Step "Creating Hetzner server nexa-labs ($($c.type) in $($c.location))"
      try {
        $create = Invoke-Hetzner POST "/servers" @{
          name        = "nexa-labs"
          server_type = $c.type
          image       = "ubuntu-24.04"
          location    = $c.location
          ssh_keys    = @($key.id)
          labels      = @{ app = "nexa-labs" }
        }
        $server = $create.server
        $script:Location = $c.location
        $script:ServerType = $c.type
        Write-Ok "Server created: $($server.id) ($($c.type) @ $($c.location))"
        break
      } catch {
        Write-Warn "$($c.type) in $($c.location) unavailable: $($_.Exception.Message)"
      }
    }
    if (-not $server) { throw "No Hetzner server type/location available in this account" }
    $serverId = $server.id

    Write-Step "Waiting for public IP"
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 5
      $s = (Invoke-Hetzner GET "/servers/$serverId").server
      $ip = $s.public_net.ipv4.ip
      if ($ip -and $s.status -eq "running") {
        $VpsIp = $ip
        break
      }
    }
    if (-not $VpsIp) { throw "Timed out waiting for Hetzner server IP" }
    Write-Ok "Public IP: $VpsIp"

    @{
      provider  = "hetzner"
      serverId  = $serverId
      publicIp  = $VpsIp
      location  = $Location
      createdAt = (Get-Date).ToString("o")
    } | ConvertTo-Json | Set-Content -Path $StateFile -Encoding utf8
  }
}

if (-not $VpsIp) { throw "No VPS IP" }
Write-Output $VpsIp
