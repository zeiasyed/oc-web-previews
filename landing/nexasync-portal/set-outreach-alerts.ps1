#Requires -Version 5.1
# Set Cloudflare Worker secrets for plumber 1-minute email alerts.
param(
  [string]$NotifyEmail = "zeiasyed@hotmail.com",
  [string]$FromEmail = "alerts@inertia-intel.com"
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$AccountId = "0f61b15e3b7ef041399aed19c79e6e7e"
$WorkerName = "nexasync-api"
$CredsFile = Join-Path $Root ".cloudflare-credentials.json"

if (-not (Test-Path $CredsFile)) { throw "Missing .cloudflare-credentials.json" }
$cf = Get-Content $CredsFile -Raw | ConvertFrom-Json
if ($cf.email -and -not $NotifyEmail) { $NotifyEmail = $cf.email }

$headers = if ($cf.type -eq "token") {
  @{ Authorization = "Bearer $($cf.token)" }
} else {
  @{ "X-Auth-Email" = $cf.email; "X-Auth-Key" = $cf.globalKey }
}

$uri = "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName/secrets"

function Set-Secret([string]$Name, [string]$Value) {
  $body = @{ name = $Name; text = $Value; type = "secret_text" } | ConvertTo-Json
  $r = Invoke-RestMethod -Method PUT -Uri $uri -Headers $headers -Body $body -ContentType "application/json"
  if (-not $r.success) { throw ($r.errors | ConvertTo-Json -Compress) }
  Write-Host "OK  $Name"
}

Write-Host "Setting outreach alert secrets on $WorkerName..."
Set-Secret "PLUMBER_OUTREACH_NOTIFY_EMAIL" $NotifyEmail
Set-Secret "OUTREACH_EMAIL_FROM" $FromEmail
Write-Host ""
Write-Host "Prospect dashboard base URL:"
Write-Host "  https://zeiasyed.github.io/oc-web-previews/landing/scan-dashboard/publish.html"
Write-Host ""
Write-Host "Emails link to: publish.html?call={call_id}"
