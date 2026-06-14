#Requires -Version 5.1
param([Parameter(Mandatory = $true)][string]$Password)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$AccountId = "0f61b15e3b7ef041399aed19c79e6e7e"
$WorkerName = "solena-qr-scan"
$DbId = "d0a30387-81e2-4ca2-86d6-0170a0b3563e"
$CredsFile = Join-Path (Split-Path $Root -Parent) "toledo-swift-haul-dashboard\.cloudflare-credentials.json"

$saved = Get-Content $CredsFile -Raw | ConvertFrom-Json
if ($saved.type -eq "token") {
  $headers = @{ Authorization = "Bearer $($saved.token)"; "Content-Type" = "application/json" }
} else {
  $headers = @{ "X-Auth-Email" = $saved.email; "X-Auth-Key" = $saved.globalKey; "Content-Type" = "application/json" }
}

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

$uploadHeaders = @{}
if ($saved.type -eq "token") { $uploadHeaders.Authorization = "Bearer $($saved.token)" }
else { $uploadHeaders["X-Auth-Email"] = $saved.email; $uploadHeaders["X-Auth-Key"] = $saved.globalKey }

Invoke-RestMethod -Method PUT `
  -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName" `
  -Headers $uploadHeaders `
  -ContentType "multipart/form-data; boundary=$boundary" `
  -Body $bodyBytes | Out-Null

$output = @{
  workerUrl = "https://solena-qr-scan.zeiasyed.workers.dev"
  dashboardPassword = $Password
  dashboardPage = "https://zeiasyed.github.io/oc-web-previews/landing/scan-dashboard/"
  updatedAt = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 3
$output | Set-Content "$Root\deploy-output.json" -Encoding UTF8

Write-Host "Password updated." -ForegroundColor Green
