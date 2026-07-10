#Requires -Version 5.1
# Cheapest paid stable path: Hetzner CAX11 (~EUR 3.79/mo) for both lab demos.
#
# Usage:
#   .\go-live-paid.ps1
#   .\go-live-paid.ps1 -VpsIp 1.2.3.4
#   .\go-live-paid.ps1 -HetznerToken "your-token"

param(
  [string]$VpsIp,
  [string]$HetznerToken
)

$ErrorActionPreference = "Stop"
$MarketingRoot = $PSScriptRoot
$SshKey = "$env:USERPROFILE\.ssh\nexa-labs_ed25519"

function Write-Step([string]$Msg) { Write-Host "`n>> $Msg" -ForegroundColor Cyan }
function Write-Ok([string]$Msg) { Write-Host "   OK  $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg) { Write-Host "   !!  $Msg" -ForegroundColor Yellow }

function Stop-PcTunnel {
  Write-Step "Stopping PC tunnel"
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  foreach ($port in 5050, 5051, 5070, 5071) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
  Write-Ok "PC tunnel stopped"
}

if (-not $VpsIp) {
  $TokenFile = Join-Path (Split-Path $MarketingRoot -Parent) ".hetzner-api-token.local"
  if (-not $HetznerToken -and -not (Test-Path $TokenFile)) {
    Write-Step "Hetzner API token required (~2 min)"
    Set-Clipboard -Value (Get-Content "$env:USERPROFILE\.ssh\nexa-labs_ed25519.pub" -Raw).Trim()
    Write-Host @"
1. Browser opening to Hetzner Cloud
2. Sign up / log in -> pick or create a project
3. Security -> API tokens -> Generate API token (Read & Write)
4. Copy the token, then run in a NEW PowerShell window:

   Set-Content -Path "$TokenFile" -Value "PASTE_TOKEN_HERE" -NoNewline

   (replace PASTE_TOKEN_HERE with your token)

SSH public key is on your clipboard for server setup.
Waiting up to 20 minutes for token file...
"@ -ForegroundColor Yellow
    Start-Process "https://console.hetzner.cloud/projects"
    $deadline = (Get-Date).AddMinutes(60)
    while ((Get-Date) -lt $deadline) {
      if (Test-Path $TokenFile) {
        $t = (Get-Content $TokenFile -Raw).Trim()
        if ($t.Length -gt 20) { Write-Ok "Token file detected"; break }
      }
      Start-Sleep -Seconds 5
    }
    if (-not (Test-Path $TokenFile)) {
      throw "Timed out waiting for $TokenFile"
    }
  }

  $provArgs = @{}
  if ($HetznerToken) { $provArgs.ApiToken = $HetznerToken }
  $VpsIp = & (Join-Path $MarketingRoot "provision-hetzner-labs.ps1") @provArgs
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Step "Waiting for SSH on $VpsIp (up to 6 min)"
$sshArgs = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10", "-i", $SshKey)
$sshReady = $false
for ($i = 0; $i -lt 36; $i++) {
  $ErrorActionPreference = "SilentlyContinue"
  & ssh @sshArgs "root@${VpsIp}" "echo ok" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $sshReady = $true; break }
  & ssh @sshArgs "ubuntu@${VpsIp}" "echo ok" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $sshReady = $true; break }
  $ErrorActionPreference = "Stop"
  Start-Sleep -Seconds 10
}
if (-not $sshReady) { throw "SSH not reachable on $VpsIp" }
Write-Ok "SSH ready"

$sshUser = "root"
& ssh @sshArgs "root@${VpsIp}" "echo ok" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  $sshUser = "ubuntu"
  & ssh @sshArgs "ubuntu@${VpsIp}" "echo ok" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { $sshUser = "root" }
}

Write-Step "Deploying demos to Hetzner VPS $VpsIp (~15-30 min first run)"
& (Join-Path $MarketingRoot "deploy-labs-vps.ps1") -VpsIp $VpsIp -SshUser $sshUser -SshKey $SshKey
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Stop-PcTunnel

Write-Step "Health check"
Start-Sleep -Seconds 8
$ok = $true
foreach ($url in @(
  "https://demo-direct.nexa-trials.com/health",
  "https://demo-source.nexa-trials.com/health"
)) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60
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
  Write-Host "Nexa labs are live 24/7 on Hetzner (~EUR 3.79/mo) - no PC tunnel." -ForegroundColor Green
  Write-Host "  https://demo-direct.nexa-trials.com/" -ForegroundColor Green
  Write-Host "  https://demo-source.nexa-trials.com/" -ForegroundColor Green
  Write-Host "  Gateway: https://nexa-trials.com/lab/" -ForegroundColor Green
  Write-Host "  Auth: test / Academy123!" -ForegroundColor Green
} else {
  Write-Warn "Deploy done; DNS may need 1-2 min. Re-check /health URLs."
}
