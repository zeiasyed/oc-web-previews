#Requires -Version 5.1
# Nexasync Portal - full Cloudflare deploy (Windows ARM compatible, no wrangler CLI)
# Uses saved credentials from .cloudflare-credentials.json or toledo-swift-haul-dashboard fallback

param(
  [string]$Token,
  [string]$Email,
  [string]$GlobalKey,
  [switch]$WorkerOnly
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$AccountId = "0f61b15e3b7ef041399aed19c79e6e7e"
$ZoneName = "inertia-intel.com"
$WorkerName = "nexasync-api"
$MarketingProject = "nexasync-marketing"
$PortalProject = "nexasync-portal-app"
$CredsFile = Join-Path $Root ".cloudflare-credentials.json"
$ToledoCreds = Join-Path (Split-Path $Root -Parent) "toledo-swift-haul-dashboard\.cloudflare-credentials.json"

$script:AuthMode = $null
$script:AuthToken = $null
$script:AuthEmail = $null
$script:AuthGlobalKey = $null
$script:ZoneId = $null

function Write-Step([string]$Msg) { Write-Host "`n>> $Msg" -ForegroundColor Cyan }
function Write-Ok([string]$Msg) { Write-Host "   OK  $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg) { Write-Host "   !!  $Msg" -ForegroundColor Yellow }
function Write-Fail([string]$Msg) { Write-Host "   XX  $Msg" -ForegroundColor Red; exit 1 }

function Test-CfToken([string]$Value) {
  try {
    $r = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/user/tokens/verify" -Headers @{ Authorization = "Bearer $Value" }
    return [bool]$r.success
  } catch { return $false }
}

function Test-CfGlobalKey([string]$Addr, [string]$Key) {
  try {
    $r = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/user" -Headers @{ "X-Auth-Email" = $Addr; "X-Auth-Key" = $Key }
    return [bool]$r.success
  } catch { return $false }
}

function Get-AuthHeaders {
  if ($script:AuthMode -eq "token") { return @{ Authorization = "Bearer $script:AuthToken" } }
  return @{ "X-Auth-Email" = $script:AuthEmail; "X-Auth-Key" = $script:AuthGlobalKey }
}

function Get-CloudflareAuth {
  if ($Token -and (Test-CfToken $Token)) {
    $script:AuthMode = "token"; $script:AuthToken = $Token; Write-Ok "Using API token param"; return
  }
  if ($Email -and $GlobalKey -and (Test-CfGlobalKey $Email $GlobalKey)) {
    $script:AuthMode = "global"; $script:AuthEmail = $Email; $script:AuthGlobalKey = $GlobalKey
    Write-Ok "Using Global API Key param"; return
  }
  if ($env:CLOUDFLARE_API_TOKEN -and (Test-CfToken $env:CLOUDFLARE_API_TOKEN)) {
    $script:AuthMode = "token"; $script:AuthToken = $env:CLOUDFLARE_API_TOKEN
    Write-Ok "Using CLOUDFLARE_API_TOKEN"; return
  }
  foreach ($path in @($CredsFile, $ToledoCreds)) {
    if (-not (Test-Path $path)) { continue }
    $saved = Get-Content $path -Raw | ConvertFrom-Json
    if ($saved.type -eq "token" -and $saved.token -and (Test-CfToken $saved.token)) {
      $script:AuthMode = "token"; $script:AuthToken = $saved.token
      Copy-Item $path $CredsFile -Force -ErrorAction SilentlyContinue
      Write-Ok "Using saved token from $(Split-Path $path -Leaf)"; return
    }
    if ($saved.type -eq "global" -and $saved.email -and $saved.globalKey -and (Test-CfGlobalKey $saved.email $saved.globalKey)) {
      $script:AuthMode = "global"; $script:AuthEmail = $saved.email; $script:AuthGlobalKey = $saved.globalKey
      Copy-Item $path $CredsFile -Force -ErrorAction SilentlyContinue
      Write-Ok "Using saved Global API Key from $(Split-Path $path -Leaf)"; return
    }
  }
  Write-Fail "No Cloudflare credentials. Copy .cloudflare-credentials.json from toledo-swift-haul-dashboard or set CLOUDFLARE_API_TOKEN."
}

function Invoke-CfApi {
  param([string]$Method, [string]$Uri, [object]$Body = $null)
  $headers = Get-AuthHeaders
  $headers["Content-Type"] = "application/json"
  $p = @{ Method = $Method; Uri = $Uri; Headers = $headers }
  if ($Body) { $p.Body = ($Body | ConvertTo-Json -Depth 12 -Compress) }
  $r = Invoke-RestMethod @p
  if (-not $r.success) { throw ($r.errors | ConvertTo-Json -Compress) }
  return $r.result
}

function Get-ZoneId {
  $zones = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/zones?name=$ZoneName"
  if (-not $zones -or $zones.Count -eq 0) { throw "Zone $ZoneName not found" }
  $script:ZoneId = $zones[0].id
  Write-Ok "Zone $ZoneName ($script:ZoneId)"
}

function Fix-SslAndDns {
  Write-Step "Fixing SSL mode and removing GoDaddy parking A records..."
  try {
    Invoke-CfApi PATCH "https://api.cloudflare.com/client/v4/zones/$script:ZoneId/settings/ssl" @{ value = "full" } | Out-Null
    Write-Ok "SSL mode: full"
  } catch { Write-Warn "SSL setting: $_" }

  try {
    Invoke-CfApi PATCH "https://api.cloudflare.com/client/v4/zones/$script:ZoneId/settings/always_use_https" @{ value = "on" } | Out-Null
    Write-Ok "Always Use HTTPS: on"
  } catch { Write-Warn "HTTPS setting: $_" }

  $records = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/zones/$script:ZoneId/dns_records?per_page=100"
  foreach ($rec in $records) {
    if ($rec.type -eq "A" -and ($rec.content -match "^15\.197\.|^3\.33\.130\.")) {
      Invoke-CfApi DELETE "https://api.cloudflare.com/client/v4/zones/$script:ZoneId/dns_records/$($rec.id)" | Out-Null
      Write-Ok "Deleted parking A record $($rec.content)"
    }
  }
}

function Ensure-D1 {
  Write-Step "Ensuring D1 database..."
  $dbName = "nexasync-portal"
  $dbId = $null
  $dbs = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database"
  $existing = $dbs | Where-Object { $_.name -eq $dbName } | Select-Object -First 1
  if ($existing) {
    $dbId = $existing.uuid
    Write-Ok "Using existing D1: $dbId"
  } else {
    $created = Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database" @{ name = $dbName }
    $dbId = $created.uuid
    Write-Ok "Created D1: $dbId"
  }

  $sql = Get-Content "$Root\schema\init.sql" -Raw
  foreach ($stmt in ($sql -split ";" | Where-Object { $_.Trim() -and $_.Trim() -notmatch "^--" })) {
    $body = (@{ sql = $stmt.Trim() } | ConvertTo-Json -Compress)
    $headers = Get-AuthHeaders
    try {
      Invoke-RestMethod -Method POST `
        -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database/$dbId/query" `
        -Headers $headers -ContentType "application/json" -Body $body | Out-Null
    } catch {
      Write-Warn "D1 statement skipped: $($stmt.Substring(0, [Math]::Min(40, $stmt.Length)))..."
    }
  }
  Write-Ok "D1 schema applied (worker also auto-creates on first request)"

  # Update wrangler.toml for reference
  $toml = Get-Content "$Root\wrangler.toml" -Raw
  $toml = $toml.Replace('database_id = "REPLACE_AT_DEPLOY"', ('database_id = "' + $dbId + '"'))
  $toml | Set-Content "$Root\wrangler.toml" -Encoding UTF8
  return $dbId
}

function Build-WorkerCode {
  function Embed-Folder($folder, $prefix) {
    $entries = @()
    Get-ChildItem $folder -File | ForEach-Object {
      $bytes = [IO.File]::ReadAllBytes($_.FullName)
      $b64 = [Convert]::ToBase64String($bytes)
      $path = "/" + $_.Name
      $entries += "`"$path`":`"$b64`""
    }
    return "const ${prefix}_B64 = { $($entries -join ',') };"
  }
  $release = @"
const PORTAL_RELEASE = {
  version: "$($script:PortalVersion)",
  build: "$($script:PortalBuildId)",
  build_label: "$($script:PortalBuildLabel)",
  built_at: "$($script:PortalBuildTime)"
};

"@
  $assets = @(
    (Embed-Folder "$Root\marketing" "MARKETING")
    (Embed-Folder "$Root\portal" "PORTAL")
    ""
  ) -join "`n"
  $workerFiles = @(
    "demo-seed-data.js", "calendar-check.js", "voice-playbook.js", "retell-voice.js",
    "notifications.js", "lab-verify-voice.js", "preview-publish.js", "plumber-outreach-voice.js",
    "voice-agent.js", "index.js"
  )
  $workerBundle = ($workerFiles | ForEach-Object { Get-Content "$Root\worker\$_" -Raw -Encoding UTF8 }) -join ""
  return $assets + $release + $workerBundle
}

function Update-PortalBuild {
  Write-Step "Stamping portal build version..."
  $versionFile = Join-Path $Root "VERSION"
  $semver = "1.0.0"
  if (Test-Path $versionFile) {
    $semver = (Get-Content $versionFile -Raw).Trim()
    if (-not $semver) { $semver = "1.0.0" }
  } else {
    Set-Content $versionFile $semver -Encoding UTF8 -NoNewline
  }

  $buildUtc = (Get-Date).ToUniversalTime()
  $script:PortalBuildId = $buildUtc.ToString("yyyyMMdd-HHmmss")
  $script:PortalVersion = $semver
  $script:PortalBuildLabel = "$semver+$($script:PortalBuildId)"
  $script:PortalBuildTime = $buildUtc.ToString("o")

  $configPath = Join-Path $Root "portal\config.js"
  @"
window.NEXASYNC_CONFIG = {
  API_BASE: "https://api.inertia-intel.com",
  APP_NAME: "Nexasync Portal",
  BRAND: "Nexa Data Flow",
  VERSION: "$semver",
  BUILD: "$($script:PortalBuildId)",
  BUILD_LABEL: "$($script:PortalBuildLabel)",
  BUILD_TIME: "$($script:PortalBuildTime)",
  SESSION_KEY: "nexasync_session",
  VAULT_KEY: "nexasync_vault_meta",
  VAULT_DEV_MODE: true,
  IDLE_TIMEOUT_MS: 15 * 60 * 1000,
};

"@ | Set-Content $configPath -Encoding UTF8 -NoNewline

  $indexPath = Join-Path $Root "portal\index.html"
  $html = Get-Content $indexPath -Raw
  $html = $html -replace '\?v=[^"]+', "?v=$($script:PortalBuildId)"
  $html = $html -replace '<meta name="nexasync-version" content="[^"]*">', "<meta name=`"nexasync-version`" content=`"$($script:PortalBuildLabel)`">"
  $html | Set-Content $indexPath -Encoding UTF8 -NoNewline

  @{
    version     = $semver
    build       = $script:PortalBuildId
    build_label = $script:PortalBuildLabel
    built_at    = $script:PortalBuildTime
  } | ConvertTo-Json | Set-Content (Join-Path $Root "build-info.json") -Encoding UTF8

  Write-Ok "Build $($script:PortalBuildLabel)"
}

function Ensure-WorkerRoutes {
  Write-Step "Attaching Worker routes for all hostnames..."
  $patterns = @(
    "inertia-intel.com/*",
    "www.inertia-intel.com/*",
    "app.inertia-intel.com/*",
    "api.inertia-intel.com/*"
  )
  try {
    $routes = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/zones/$script:ZoneId/workers/routes"
    foreach ($pattern in $patterns) {
      $exists = $routes | Where-Object { $_.pattern -eq $pattern }
      if (-not $exists) {
        Invoke-CfApi POST "https://api.cloudflare.com/client/v4/zones/$script:ZoneId/workers/routes" `
          @{ pattern = $pattern; script = $WorkerName } | Out-Null
      }
      Write-Ok "Route $pattern"
    }
  } catch { Write-Warn "Routes: $_" }
}

function Deploy-Worker {
  param([string]$DbId)
  Write-Step "Deploying Worker ($WorkerName) with embedded marketing + portal..."
  $workerCode = Build-WorkerCode
  $metadataObj = @{
    main_module = "index.js"
    bindings = @(
      @{ type = "d1"; name = "DB"; id = $DbId }
      @{ type = "plain_text"; name = "PUBLIC_APP_URL"; text = "https://app.inertia-intel.com" }
      @{ type = "plain_text"; name = "PUBLIC_MARKETING_URL"; text = "https://inertia-intel.com" }
      @{ type = "plain_text"; name = "PREVIEW_PAGES_ORIGIN"; text = "https://zeiasyed.github.io/oc-web-previews" }
      @{ type = "plain_text"; name = "PREVIEW_PUBLISH_PAGE_BASE"; text = "https://zeiasyed.github.io/oc-web-previews/landing/scan-dashboard/publish.html" }
      @{ type = "plain_text"; name = "PLUMBER_OUTREACH_VOICE_ID"; text = "11labs-Brian" }
      @{ type = "plain_text"; name = "PLUMBER_OUTREACH_VOICE_MODEL"; text = "eleven_v3" }
      @{ type = "plain_text"; name = "PLUMBER_OUTREACH_EXPRESSIVE_MODE"; text = "1" }
      @{ type = "plain_text"; name = "CORS_ORIGINS"; text = "https://app.inertia-intel.com,https://inertia-intel.com,https://www.inertia-intel.com,https://zeiasyed.github.io,http://localhost:8787,http://127.0.0.1:8787" }
    )
    triggers = @{ crons = @("* * * * *") }
  }
  $metadata = $metadataObj | ConvertTo-Json -Depth 8 -Compress
  $boundary = [System.Guid]::NewGuid().ToString()
  $LF = "`r`n"
  $bodyLines = @(
    "--$boundary", "Content-Disposition: form-data; name=`"metadata`"", "Content-Type: application/json", "", $metadata,
    "--$boundary", "Content-Disposition: form-data; name=`"index.js`"; filename=`"index.js`"", "Content-Type: application/javascript+module", "", $workerCode,
    "--${boundary}--"
  )
  $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes(($bodyLines -join $LF))
  $uploadHeaders = Get-AuthHeaders
  Invoke-RestMethod -Method PUT `
    -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName" `
    -Headers $uploadHeaders -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyBytes | Out-Null
  Write-Ok "Worker uploaded"

  try {
    Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/domains" @{
      hostname = "api.inertia-intel.com"; service = $WorkerName; environment = "production"
    } | Out-Null
    Write-Ok "Custom domain api.inertia-intel.com"
  } catch { Write-Warn "Worker domain (may already exist): $_" }

  try {
    $schedBody = '[{"cron":"* * * * *"}]'
    $schedHeaders = Get-AuthHeaders
    $schedHeaders["Content-Type"] = "application/json"
    Invoke-RestMethod -Method PUT `
      -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName/schedules" `
      -Headers $schedHeaders -Body $schedBody | Out-Null
    Write-Ok "Worker cron schedule (* * * * *)"
  } catch { Write-Warn "Worker cron schedule: $($_.Exception.Message)" }
}

function Get-FileHashB64([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  return [Convert]::ToBase64String($sha)
}

function Deploy-PagesFolder {
  param([string]$FolderPath, [string]$ProjectName, [string[]]$CustomDomains)
  Write-Step "Deploying Pages: $ProjectName from $FolderPath"

  try {
    Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects" @{
      name = $ProjectName; production_branch = "main"
    } | Out-Null
    Write-Ok "Created Pages project $ProjectName"
  } catch { Write-Ok "Pages project $ProjectName exists" }

  $files = Get-ChildItem $FolderPath -File -Recurse
  $manifest = @{}
  $fileMap = @{}
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($FolderPath.Length).Replace("\", "/")
    if (-not $rel.StartsWith("/")) { $rel = "/" + $rel }
    $hash = Get-FileHashB64 $f.FullName
    $manifest[$rel] = $hash
    $fileMap[$hash] = $f.FullName
  }
  $manifestJson = $manifest | ConvertTo-Json -Compress
  $boundary = [System.Guid]::NewGuid().ToString()
  $LF = "`r`n"
  $utf8 = [System.Text.Encoding]::UTF8
  $multipart = New-Object System.Collections.Generic.List[byte]
  $manifestPart = "--$boundary$LF" + 'Content-Disposition: form-data; name="manifest"' + "$LF" + "Content-Type: application/json$LF$LF" + $manifestJson + $LF
  $multipart.AddRange($utf8.GetBytes($manifestPart))
  foreach ($hash in $fileMap.Keys) {
    $path = $fileMap[$hash]
    $fileName = Split-Path $path -Leaf
    $fileBytes = [System.IO.File]::ReadAllBytes($path)
    $header = "--$boundary$LF" + "Content-Disposition: form-data; name=`"$hash`"; filename=`"$fileName`"$LF" + "Content-Type: application/octet-stream$LF$LF"
    $multipart.AddRange($utf8.GetBytes($header))
    $multipart.AddRange($fileBytes)
    $multipart.AddRange($utf8.GetBytes($LF))
  }
  $multipart.AddRange($utf8.GetBytes("--${boundary}--$LF"))
  $uploadHeaders = Get-AuthHeaders
  Invoke-RestMethod -Method POST `
    -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$ProjectName/deployments" `
    -Headers $uploadHeaders -ContentType "multipart/form-data; boundary=$boundary" `
    -Body ([byte[]]$multipart.ToArray()) | Out-Null
  Write-Ok "Pages deployment uploaded"

  foreach ($domain in $CustomDomains) {
    try {
      Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$ProjectName/domains" @{ name = $domain } | Out-Null
      Write-Ok "Custom domain $domain"
    } catch { Write-Warn "Domain $domain : $_" }
  }
}

function Test-Privacy {
  $leaks = Select-String -Path "$Root\marketing\*","$Root\portal\*","$Root\worker\*" -Pattern "zeiasyed" -SimpleMatch -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -notmatch "deploy" }
  if ($leaks) { Write-Fail "Found zeiasyed in project files" }
  Write-Ok "Privacy check passed"
}

# --- Main ---
Write-Host "Nexasync Portal - Cloudflare deploy" -ForegroundColor Cyan
Write-Host "Domain: inertia-intel.com" -ForegroundColor Gray

Get-CloudflareAuth
Test-Privacy
$dbId = Ensure-D1
Update-PortalBuild
Deploy-Worker -DbId $dbId

if ($WorkerOnly) {
  Write-Host ""
  Write-Host "=== WORKER DEPLOY COMPLETE ===" -ForegroundColor Green
  Write-Host "API: https://api.inertia-intel.com/health"
  exit 0
}

Get-ZoneId
Fix-SslAndDns
Ensure-WorkerRoutes

# Point apex + app DNS to Worker (proxied)
Write-Step "Updating DNS for Worker static + API..."
foreach ($rec in @(
  @{ type = "AAAA"; name = "inertia-intel.com"; content = "100::"; proxied = $true },
  @{ type = "AAAA"; name = "www"; content = "100::"; proxied = $true },
  @{ type = "AAAA"; name = "app"; content = "100::"; proxied = $true },
  @{ type = "AAAA"; name = "api"; content = "100::"; proxied = $true }
)) {
  $existing = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/zones/$script:ZoneId/dns_records?name=$($rec.name).$ZoneName"
  if ($rec.name -eq "inertia-intel.com") { $existing = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/zones/$script:ZoneId/dns_records?name=$ZoneName" }
  if ($existing.Count -gt 0 -or ($existing -is [array] -and $existing.Count -gt 0)) {
    $id = if ($existing -is [array]) { $existing[0].id } else { $existing.id }
    Invoke-CfApi PATCH "https://api.cloudflare.com/client/v4/zones/$script:ZoneId/dns_records/$id" -Body $rec | Out-Null
    Write-Ok "DNS $($rec.name)"
  } else {
    Invoke-CfApi POST "https://api.cloudflare.com/client/v4/zones/$script:ZoneId/dns_records" -Body $rec | Out-Null
    Write-Ok "DNS $($rec.name) created"
  }
}

# Pages deploy skipped — static assets served from Worker (Pages direct upload returned 500 on this account)

Write-Step "Waiting for propagation (30s)..."
Start-Sleep -Seconds 30

$out = @{
  marketingUrl = "https://inertia-intel.com"
  portalUrl    = "https://app.inertia-intel.com"
  apiUrl       = "https://api.inertia-intel.com"
  healthCheck  = "https://api.inertia-intel.com/health"
  version      = $script:PortalVersion
  build        = $script:PortalBuildId
  buildLabel   = $script:PortalBuildLabel
  deployedAt   = $script:PortalBuildTime
}
$out | ConvertTo-Json | Set-Content "$Root\deploy-output.json" -Encoding UTF8

Write-Host ""
Write-Host "=== DEPLOY COMPLETE ===" -ForegroundColor Green
Write-Host "Marketing:  https://inertia-intel.com"
Write-Host "Portal:     https://app.inertia-intel.com"
Write-Host "API:        https://api.inertia-intel.com/health"
Write-Host "Build:      $($script:PortalBuildLabel)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Version shows on login, sidebar, Settings, and GET /health -> release."
