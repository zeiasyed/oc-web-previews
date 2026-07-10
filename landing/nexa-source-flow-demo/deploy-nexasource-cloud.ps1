#Requires -Version 5.1
# Deploy NexaSource to Render (always-on) and point demo-source.nexa-trials.com at it.
# Usage:
#   .\deploy-nexasource-cloud.ps1
#   .\deploy-nexasource-cloud.ps1 -RenderServiceUrl "https://nexasource-demo.onrender.com"
#   .\deploy-nexasource-cloud.ps1 -RenderApiKey "rnd_..."

param(
  [string]$RenderApiKey,
  [string]$RenderServiceUrl,
  [string]$Repo = "https://github.com/zeiasyed/oc-web-previews",
  [string]$Branch = "main",
  [switch]$DnsOnly
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$TrialsRoot = Join-Path (Split-Path $Root -Parent) "nexa-trials"
$CredsFile = Join-Path $TrialsRoot ".cloudflare-credentials.json"
$LabFile = Join-Path $TrialsRoot ".lab-access.local.json"
$RenderKeyFile = Join-Path $TrialsRoot ".render-api-key.local"
$ZoneName = "nexa-trials.com"
$DemoHost = "demo-source.nexa-trials.com"
$EdcHost = "demo-source-edc.nexa-trials.com"
$ServiceName = "nexasource-demo"

function Write-Step([string]$Msg) { Write-Host "`n>> $Msg" -ForegroundColor Cyan }
function Write-Ok([string]$Msg) { Write-Host "   OK  $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg) { Write-Host "   !!  $Msg" -ForegroundColor Yellow }

function Get-CfHeaders {
  param($Creds)
  if ($Creds.type -eq "token") { return @{ Authorization = "Bearer $($Creds.token)" } }
  return @{ "X-Auth-Email" = $Creds.email; "X-Auth-Key" = $Creds.globalKey }
}

function Invoke-RenderApi {
  param([string]$Method, [string]$Path, [object]$Body = $null)
  $headers = @{
    Authorization = "Bearer $script:RenderKey"
    Accept        = "application/json"
  }
  $uri = "https://api.render.com/v1$Path"
  if ($Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8)
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
}

function Wait-RenderDeploy {
  param([string]$ServiceId)
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 10
    $deploys = Invoke-RenderApi GET "/services/$ServiceId/deploys?limit=1"
    $latest = $deploys[0]
    if (-not $latest) { continue }
    $status = $latest.deploy.status
    Write-Host "   deploy: $status" -ForegroundColor Gray
    if ($status -eq "live") { return $latest }
    if ($status -in @("build_failed", "update_failed", "canceled")) {
      throw "Render deploy failed: $status"
    }
  }
  throw "Timed out waiting for Render deploy"
}

function Set-CfCname {
  param([string]$RecordName, [string]$Target, [hashtable]$Headers, [string]$Zone)
  $fqdn = "$RecordName.$ZoneName"
  $records = (Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$Zone/dns_records?name=$fqdn" -Headers $Headers).result
  $payload = @{
    type    = "CNAME"
    name    = $RecordName
    content = $Target
    proxied = $true
    ttl     = 1
  }
  if ($records) {
    $null = Invoke-RestMethod -Method PUT -Uri "https://api.cloudflare.com/client/v4/zones/$Zone/dns_records/$($records[0].id)" -Headers $Headers -ContentType "application/json" -Body ($payload | ConvertTo-Json)
    Write-Ok "Updated $fqdn -> $Target"
  } else {
    $null = Invoke-RestMethod -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$Zone/dns_records" -Headers $Headers -ContentType "application/json" -Body ($payload | ConvertTo-Json)
    Write-Ok "Created $fqdn -> $Target"
  }
}

if (-not $RenderApiKey -and $env:RENDER_API_KEY) { $RenderApiKey = $env:RENDER_API_KEY }
if (-not $RenderApiKey -and (Test-Path $RenderKeyFile)) {
  $RenderApiKey = (Get-Content $RenderKeyFile -Raw).Trim()
}
$script:RenderKey = $RenderApiKey

$lab = if (Test-Path $LabFile) { Get-Content $LabFile -Raw | ConvertFrom-Json } else { $null }
$labUser = if ($lab.user) { $lab.user } else { "test" }
$labPass = if ($lab.password) { $lab.password } else { "" }

if (-not (Test-Path $CredsFile)) {
  throw "Missing Cloudflare credentials: $CredsFile"
}
$cf = Get-Content $CredsFile -Raw | ConvertFrom-Json
$cfHeaders = Get-CfHeaders $cf
$zoneId = (Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones?name=$ZoneName" -Headers $cfHeaders).result[0].id

$serviceUrl = $RenderServiceUrl
$serviceId = $null

if (-not $DnsOnly) {
  if (-not $script:RenderKey) {
    Write-Warn "No Render API key. One-click deploy:"
    Write-Host "   https://render.com/deploy?repo=$([uri]::EscapeDataString($Repo))" -ForegroundColor Yellow
    Write-Host ""
    Write-Warn "After Render finishes, re-run with:"
    Write-Host "   .\deploy-nexasource-cloud.ps1 -RenderServiceUrl https://$ServiceName.onrender.com" -ForegroundColor Yellow
    if (-not $RenderServiceUrl) { exit 1 }
  } else {
    Write-Step "Render: locate or create $ServiceName"
    $owners = Invoke-RenderApi GET "/owners?limit=20"
    $owner = $owners[0]
    if (-not $owner) { throw "No Render owner found for this API key." }
    $ownerId = $owner.owner.id

    $existing = Invoke-RenderApi GET "/services?name=$ServiceName&limit=20"
    $service = $existing | Where-Object { $_.service.name -eq $ServiceName } | Select-Object -First 1

    if (-not $service) {
      Write-Host "   Creating web service..." -ForegroundColor Gray
      $created = Invoke-RenderApi POST "/services" @{
        type       = "web_service"
        name       = $ServiceName
        ownerId    = $ownerId
        repo       = $Repo
        branch     = $Branch
        rootDir    = "landing/nexa-source-flow-demo"
        runtime    = "docker"
        plan       = "starter"
        autoDeploy = "yes"
        envVars    = @(
          @{ key = "LAB_AUTH_USER"; value = $labUser }
          @{ key = "LAB_AUTH_PASSWORD"; value = $labPass }
          @{ key = "LAB_AUTH_EDC"; value = "0" }
          @{ key = "EDC_PUBLIC_BASE"; value = "/edc" }
          @{ key = "SCRIPT_ROOT"; value = "/edc" }
        )
      }
      $service = $created
      Write-Ok "Created Render service"
    } else {
      Write-Ok "Found existing Render service"
      $serviceId = $service.service.id
      Invoke-RenderApi POST "/services/$serviceId/env-vars" @(
        @{ key = "LAB_AUTH_USER"; value = $labUser }
        @{ key = "LAB_AUTH_PASSWORD"; value = $labPass }
        @{ key = "LAB_AUTH_EDC"; value = "0" }
      ) | Out-Null
      Invoke-RenderApi POST "/services/$serviceId/deploys" @{} | Out-Null
    }

    $serviceId = $service.service.id
    $serviceUrl = "https://$($service.service.slug).onrender.com"
    Write-Ok "Render URL: $serviceUrl"

    Write-Step "Render: waiting for deploy"
    Wait-RenderDeploy $serviceId | Out-Null
    Write-Ok "Deploy is live"

    foreach ($hostName in @($DemoHost, $EdcHost)) {
      Write-Step "Render: attach custom domain $hostName"
      try {
        Invoke-RenderApi POST "/services/$serviceId/custom-domains" @{ name = $hostName } | Out-Null
        Write-Ok "Custom domain registered: $hostName"
      } catch {
        Write-Warn "Custom domain may already exist on Render ($hostName): $($_.Exception.Message)"
      }
    }
  }
}

if (-not $serviceUrl) {
  $serviceUrl = if ($RenderServiceUrl) { $RenderServiceUrl.TrimEnd('/') } else { "https://$ServiceName.onrender.com" }
}

$target = ($serviceUrl -replace '^https?://', '').TrimEnd('/')
Write-Step "Cloudflare DNS: $DemoHost + $EdcHost -> Render"
Set-CfCname -RecordName "demo-source" -Target $target -Headers $cfHeaders -Zone $zoneId
Set-CfCname -RecordName "demo-source-edc" -Target $target -Headers $cfHeaders -Zone $zoneId

Write-Step "Verify health"
Start-Sleep -Seconds 5
foreach ($url in @("https://$DemoHost/health", "$serviceUrl/health")) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
    if ($r.StatusCode -eq 200) {
      Write-Ok "$url -> $($r.Content)"
      break
    }
  } catch {
    Write-Warn "$url not ready yet: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "NexaSource lab (24/7 on Render starter):" -ForegroundColor Green
Write-Host "  https://$DemoHost/" -ForegroundColor Green
Write-Host "  Mock EDC: https://$DemoHost/edc/  (legacy: https://$EdcHost/)" -ForegroundColor Green
Write-Host "  Gateway:  https://nexa-trials.com/lab/" -ForegroundColor Green
Write-Host "  Auth:     $labUser / (from .lab-access.local.json)" -ForegroundColor Green
