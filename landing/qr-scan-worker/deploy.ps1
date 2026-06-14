#Requires -Version 5.1
# Deploy Solena QR scan worker (same Cloudflare account as Toledo dashboard)
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$AccountId = "0f61b15e3b7ef041399aed19c79e6e7e"
$WorkerName = "solena-qr-scan"
$DbName = "solena-qr-scans"
$CredsFile = Join-Path (Split-Path $Root -Parent) "toledo-swift-haul-dashboard\.cloudflare-credentials.json"
$RepoRoot = Split-Path (Split-Path $Root -Parent) -Parent

$script:AuthEmail = $null
$script:AuthGlobalKey = $null
$script:AuthToken = $null
$script:AuthMode = $null

function Get-AuthHeaders {
  if ($script:AuthMode -eq "token") {
    return @{ Authorization = "Bearer $script:AuthToken" }
  }
  return @{ "X-Auth-Email" = $script:AuthEmail; "X-Auth-Key" = $script:AuthGlobalKey }
}

function Test-CfToken([string]$Value) {
  try {
    $r = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/user/tokens/verify" `
      -Headers @{ Authorization = "Bearer $Value" }
    return [bool]$r.success
  } catch { return $false }
}

function Test-CfGlobalKey([string]$Addr, [string]$Key) {
  try {
    $r = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/user" `
      -Headers @{ "X-Auth-Email" = $Addr; "X-Auth-Key" = $Key }
    return [bool]$r.success
  } catch { return $false }
}

function Load-Auth {
  if (-not (Test-Path $CredsFile)) {
    throw "Cloudflare credentials not found. Run toledo-swift-haul-dashboard\deploy.ps1 once first."
  }
  $saved = Get-Content $CredsFile -Raw | ConvertFrom-Json
  if ($saved.type -eq "token" -and $saved.token -and (Test-CfToken $saved.token)) {
    $script:AuthMode = "token"
    $script:AuthToken = $saved.token
    return
  }
  if ($saved.type -eq "global" -and $saved.email -and $saved.globalKey -and `
      (Test-CfGlobalKey $saved.email $saved.globalKey)) {
    $script:AuthMode = "global"
    $script:AuthEmail = $saved.email
    $script:AuthGlobalKey = $saved.globalKey
    return
  }
  throw "Saved Cloudflare credentials are invalid. Re-run toledo deploy.ps1 to refresh."
}

function Invoke-CfApi {
  param([string]$Method, [string]$Uri, [object]$Body = $null)
  $headers = Get-AuthHeaders
  $headers["Content-Type"] = "application/json"
  $p = @{ Method = $Method; Uri = $Uri; Headers = $headers }
  if ($Body) { $p.Body = ($Body | ConvertTo-Json -Depth 10 -Compress) }
  $r = Invoke-RestMethod @p
  if (-not $r.success) { throw ($r.errors | ConvertTo-Json -Compress) }
  return $r.result
}

Load-Auth
Write-Host "Cloudflare auth OK ($($script:AuthMode))" -ForegroundColor Green

Write-Host "Setting up D1 database..." -ForegroundColor Cyan
$dbs = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database"
$existing = $dbs | Where-Object { $_.name -eq $DbName } | Select-Object -First 1
if ($existing) {
  $dbId = $existing.uuid
  Write-Host "Using existing D1: $dbId"
} else {
  $created = Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database" @{ name = $DbName }
  $dbId = $created.uuid
  Write-Host "Created D1: $dbId"
}

$schema = Get-Content "$Root\schema.sql" -Raw
foreach ($sql in (($schema -split ";") | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
  Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database/$dbId/query" @{ sql = $sql } | Out-Null
}
$migratePath = Join-Path $Root "migrate-location.sql"
if (Test-Path $migratePath) {
  foreach ($sql in (((Get-Content $migratePath -Raw) -split ";") | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
    try {
      Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database/$dbId/query" @{ sql = $sql } | Out-Null
    } catch {
      $msg = $_.Exception.Message
      if ($msg -notmatch "duplicate column|already exists") { throw }
    }
  }
}
Write-Host "D1 schema applied." -ForegroundColor Green

$DashboardPassword = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
Write-Host "Dashboard password: $DashboardPassword" -ForegroundColor Yellow

Write-Host "Deploying worker..." -ForegroundColor Cyan
$workerCode = Get-Content "$Root\index.js" -Raw
$metadata = @{
  main_module = "index.js"
  bindings = @(
    @{ type = "d1"; name = "DB"; id = $dbId }
    @{ type = "plain_text"; name = "DASHBOARD_PASSWORD"; text = $DashboardPassword }
  )
} | ConvertTo-Json -Depth 5 -Compress

$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"
$bodyLines = @(
  "--$boundary",
  "Content-Disposition: form-data; name=`"metadata`"",
  "Content-Type: application/json",
  "",
  $metadata,
  "--$boundary",
  "Content-Disposition: form-data; name=`"index.js`"; filename=`"index.js`"",
  "Content-Type: application/javascript+module",
  "",
  $workerCode,
  "--$boundary--"
)
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes(($bodyLines -join $LF))

Invoke-RestMethod -Method PUT `
  -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName" `
  -Headers (Get-AuthHeaders) `
  -ContentType "multipart/form-data; boundary=$boundary" `
  -Body $bodyBytes | Out-Null

try {
  Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName/subdomain" @{ enabled = $true } | Out-Null
} catch { }

$subdomain = (Invoke-CfApi GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/subdomain").subdomain
$WorkerUrl = "https://$WorkerName.$subdomain.workers.dev"
Write-Host "Worker URL: $WorkerUrl" -ForegroundColor Green

# Health check
$health = $null
for ($i = 0; $i -lt 6; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "$WorkerUrl/health" -Method GET -TimeoutSec 15
    if ($health.ok) { break }
  } catch { Start-Sleep -Seconds 3 }
}
if (-not $health -or -not $health.ok) { throw "Health check failed after deploy" }

$output = @{
  workerUrl = $WorkerUrl
  dashboardPassword = $DashboardPassword
  dashboardPage = "https://zeiasyed.github.io/oc-web-previews/landing/scan-dashboard/"
  deployedAt = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 3
$output | Set-Content "$Root\deploy-output.json" -Encoding UTF8

# Update branding.json
$brandingPath = Join-Path $RepoRoot "config\branding.json"
$branding = Get-Content $brandingPath -Raw | ConvertFrom-Json
$branding | Add-Member -NotePropertyName qr_scan_api -NotePropertyValue $WorkerUrl -Force
($branding | ConvertTo-Json -Depth 5) + "`n" | Set-Content $brandingPath -Encoding UTF8

& python (Join-Path $RepoRoot "scripts\sync_branding.py")

Write-Host ""
Write-Host "=== QR SCAN TRACKER DEPLOYED ===" -ForegroundColor Green
Write-Host "API:        $WorkerUrl"
Write-Host "Dashboard:  https://zeiasyed.github.io/oc-web-previews/landing/scan-dashboard/"
Write-Host "Password:   $DashboardPassword"
Write-Host ""
Write-Host "Push to GitHub Pages to activate connect.html tracking:" -ForegroundColor Yellow
Write-Host "  git add config/branding.json landing/assets/branding.js landing/connect.html landing/scan-dashboard landing/qr-scan-worker"
Write-Host "  git commit -m 'Enable QR scan tracking'"
Write-Host "  git push"
