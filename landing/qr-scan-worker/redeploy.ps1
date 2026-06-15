#Requires -Version 5.1
# Redeploy worker code + D1 migrations; keeps existing dashboard password.
param([string]$Password)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$AccountId = "0f61b15e3b7ef041399aed19c79e6e7e"
$WorkerName = "solena-qr-scan"
$DbId = "d0a30387-81e2-4ca2-86d6-0170a0b3563e"
$CredsFile = Join-Path (Split-Path $Root -Parent) "toledo-swift-haul-dashboard\.cloudflare-credentials.json"
$OutputFile = Join-Path $Root "deploy-output.json"

function Get-AuthHeaders {
  if ($script:AuthMode -eq "token") {
    return @{ Authorization = "Bearer $script:AuthToken" }
  }
  return @{ "X-Auth-Email" = $script:AuthEmail; "X-Auth-Key" = $script:AuthGlobalKey }
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

$saved = Get-Content $CredsFile -Raw | ConvertFrom-Json
if ($saved.type -eq "token") {
  $script:AuthMode = "token"
  $script:AuthToken = $saved.token
} else {
  $script:AuthMode = "global"
  $script:AuthEmail = $saved.email
  $script:AuthGlobalKey = $saved.globalKey
}

if (-not $Password -and (Test-Path $OutputFile)) {
  $Password = (Get-Content $OutputFile -Raw | ConvertFrom-Json).dashboardPassword
}
if (-not $Password) {
  throw "No password. Pass -Password or run deploy.ps1 first."
}

Write-Host "Applying D1 schema + migrations..." -ForegroundColor Cyan
$sqlFiles = @("schema.sql", "migrate-location.sql", "migrate-funnel-events.sql")
foreach ($file in $sqlFiles) {
  $path = Join-Path $Root $file
  if (-not (Test-Path $path)) { continue }
  $sql = Get-Content $path -Raw
  foreach ($stmt in (($sql -split ";") | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
    try {
      Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database/$DbId/query" @{ sql = $stmt } | Out-Null
    } catch {
      $msg = "$($_.Exception.Message) $($_.ErrorDetails.Message)"
      if ($msg -notmatch "duplicate column|already exists|SQLITE_ERROR") { throw }
    }
  }
}

Write-Host "Deploying worker..." -ForegroundColor Cyan
$workerCode = Get-Content "$Root\index.js" -Raw
$metadata = @{
  main_module = "index.js"
  bindings = @(
    @{ type = "d1"; name = "DB"; id = $DbId }
    @{ type = "plain_text"; name = "DASHBOARD_PASSWORD"; text = $Password }
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
$uploadHeaders = Get-AuthHeaders

Invoke-RestMethod -Method PUT `
  -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName" `
  -Headers $uploadHeaders `
  -ContentType "multipart/form-data; boundary=$boundary" `
  -Body $bodyBytes | Out-Null

$health = Invoke-RestMethod -Uri "https://solena-qr-scan.zeiasyed.workers.dev/health" -Method GET
if (-not $health.ok) { throw "Health check failed" }

@{
  workerUrl = "https://solena-qr-scan.zeiasyed.workers.dev"
  dashboardPassword = $Password
  dashboardPage = "https://zeiasyed.github.io/oc-web-previews/landing/scan-dashboard/"
  updatedAt = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 3 | Set-Content $OutputFile -Encoding UTF8

Write-Host "Worker redeployed with location tracking." -ForegroundColor Green
