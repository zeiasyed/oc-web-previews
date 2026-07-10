#Requires -Version 5.1
# Nexa Trials - Cloudflare Pages + Worker deploy for nexa-trials.com

param(
  [string]$Token,
  [string]$Email,
  [string]$GlobalKey,
  [switch]$WorkerOnly,
  [switch]$PagesOnly
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$AccountId = "0f61b15e3b7ef041399aed19c79e6e7e"
$ZoneName = "nexa-trials.com"
$LegacyZoneName = "auctus-intl.com"
$WorkerName = "nexa-trials-api"
$PagesProject = "nexa-trials-site"
$SiteDomains = @("nexa-trials.com", "www.nexa-trials.com")
$CredsFile = Join-Path $Root ".cloudflare-credentials.json"
$ToledoCreds = Join-Path (Split-Path $Root -Parent) "toledo-swift-haul-dashboard\.cloudflare-credentials.json"
$NexasyncCreds = Join-Path (Split-Path $Root -Parent) "nexasync-portal\.cloudflare-credentials.json"

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
  foreach ($path in @($CredsFile, $NexasyncCreds, $ToledoCreds)) {
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
  Write-Fail "No Cloudflare credentials. Copy .cloudflare-credentials.json from nexasync-portal or toledo-swift-haul-dashboard."
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

function Get-FileHashB64([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  return [Convert]::ToBase64String($sha)
}

function Get-SiteFiles {
  $excludeDirs = @("worker", "assets/logo-options", "assets\logo-options", "marketing")
  $excludeFiles = @("deploy-cloudflare.ps1", "wrangler.toml", "README.md", ".cloudflare-credentials.json", "deploy-output.json", "update-godaddy-ns.ps1", "_debug-size.ps1", "_patch-header.py", "_patch_services.py")
  $files = @()
  Get-ChildItem $Root -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($Root.Length).TrimStart("\", "/")
    $relNorm = $rel -replace "\\", "/"
    $skip = $false
    foreach ($ex in $excludeDirs) {
      $exNorm = ($ex -replace "\\", "/").TrimEnd("/")
      if ($relNorm -eq $exNorm -or $relNorm.StartsWith("$exNorm/")) { $skip = $true; break }
    }
    if ($skip) { return }
    if ($excludeFiles -contains $_.Name) { return }
    $files += $_
  }
  return $files
}

function Build-WorkerCode {
  $entries = @()
  foreach ($f in (Get-SiteFiles)) {
    $rel = $f.FullName.Substring($Root.Length).Replace("\", "/")
    if (-not $rel.StartsWith("/")) { $rel = "/" + $rel }
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $b64 = [Convert]::ToBase64String($bytes)
    $entries += "`"$rel`":`"$b64`""
  }
  $static = "const STATIC_B64 = { $($entries -join ',') };`n"
  $clientDemos = Get-Content (Join-Path $Root "worker\client-demos.js") -Raw
  $workerBody = Get-Content (Join-Path $Root "worker\index.js") -Raw
  return $static + $clientDemos + "`n" + $workerBody
}

function Get-PagesFiles {
  return Get-SiteFiles
}

function Deploy-Pages {
  Write-Step "Deploying Pages: $PagesProject"

  try {
    Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects" @{
      name = $PagesProject; production_branch = "main"
    } | Out-Null
    Write-Ok "Created Pages project $PagesProject"
  } catch { Write-Ok "Pages project $PagesProject exists" }

  $files = Get-PagesFiles
  $manifest = @{}
  $fileMap = @{}
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($Root.Length).Replace("\", "/")
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
  $deploy = Invoke-RestMethod -Method POST `
    -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$PagesProject/deployments" `
    -Headers $uploadHeaders -ContentType "multipart/form-data; boundary=$boundary" `
    -Body ([byte[]]$multipart.ToArray())
  if (-not $deploy.success) { throw ($deploy.errors | ConvertTo-Json -Compress) }
  $script:PagesUrl = $deploy.result.url
  Write-Ok "Pages deployed: $($deploy.result.url)"

  foreach ($domain in $SiteDomains) {
    try {
      Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$PagesProject/domains" @{ name = $domain } | Out-Null
      Write-Ok "Custom domain $domain"
    } catch { Write-Warn "Domain $domain : $_" }
  }
}

function Deploy-Worker {
  Write-Step "Deploying Worker ($WorkerName) with embedded site..."
  $workerCode = Build-WorkerCode
  $bindings = @(
    @{ type = "plain_text"; name = "CONTACT_TO"; text = "info@nexa-trials.com" }
    @{ type = "plain_text"; name = "CAREERS_TO"; text = "zeiasyed@hotmail.com" }
    @{ type = "plain_text"; name = "FROM_EMAIL"; text = "noreply@nexa-trials.com" }
    @{ type = "plain_text"; name = "CORS_ORIGINS"; text = "https://nexa-trials.com,https://www.nexa-trials.com,https://auctus-intl.com,https://www.auctus-intl.com" }
  )

  $demoStateFile = Join-Path $Root ".client-demos-state.local.json"
  if (Test-Path $demoStateFile) {
    $demoState = Get-Content $demoStateFile -Raw | ConvertFrom-Json
    if ($demoState.kvNamespaceId) {
      $bindings += @{ type = "kv_namespace"; name = "CLIENT_DEMOS_KV"; namespace_id = $demoState.kvNamespaceId }
      Write-Ok "Binding CLIENT_DEMOS_KV"
    }
    if ($demoState.r2BucketName) {
      Write-Ok "R2 bucket configured: $($demoState.r2BucketName) (optional - videos can use VPS origin)"
    }
    if ($demoState.videoOriginBase) {
      $bindings += @{ type = "plain_text"; name = "VIDEO_ORIGIN_BASE"; text = $demoState.videoOriginBase }
      Write-Ok "VIDEO_ORIGIN_BASE -> $($demoState.videoOriginBase)"
    }
    if ($demoState.videoOriginSecret) {
      $bindings += @{ type = "plain_text"; name = "VIDEO_ORIGIN_SECRET"; text = $demoState.videoOriginSecret }
      Write-Ok "VIDEO_ORIGIN_SECRET configured"
    }
  } else {
    Write-Warn "No .client-demos-state.local.json - client demo videos disabled until you run manage-client-demos.ps1 -Action setup"
  }

  $metadataObj = @{
    main_module = "index.js"
    bindings = $bindings
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
}

function Ensure-Zone([string]$Name) {
  try {
    $zones = @(Invoke-CfApi GET "https://api.cloudflare.com/client/v4/zones?name=$Name")
    if ($zones.Count -gt 0) { return $zones[0] }
  } catch {}

  Write-Step "Adding zone $Name to Cloudflare..."
  $created = Invoke-CfApi POST "https://api.cloudflare.com/client/v4/zones" @{
    name = $Name
    account = @{ id = $AccountId }
    jump_start = $true
    type = "full"
  }
  Write-Ok "Created zone $Name"
  return $created
}

function Get-ZoneId([string]$Name = $ZoneName) {
  try {
    $zone = Ensure-Zone $Name
    if ($zone) {
      $script:ZoneId = $zone.id
      $status = $zone.status
      Write-Ok "Zone $Name ($script:ZoneId) status=$status"
      if ($status -ne "active") {
        $ns = $zone.name_servers -join ", "
        Write-Warn "Zone is $status - update GoDaddy nameservers to: $ns"
      }
      return $zone
    }
  } catch {
    Write-Warn "Zone $Name error: $_"
  }
  Write-Warn "Zone $Name not available in Cloudflare."
  return $null
}

function Configure-DnsAndRoutes {
  param([string]$TargetZoneName = $ZoneName)

  $zone = Get-ZoneId $TargetZoneName
  if (-not $zone) { return $false }
  $zoneId = $zone.id

  Write-Step "Configuring SSL and DNS for $TargetZoneName..."
  try {
    Invoke-CfApi PATCH "https://api.cloudflare.com/client/v4/zones/$zoneId/settings/ssl" @{ value = "full" } | Out-Null
    Invoke-CfApi PATCH "https://api.cloudflare.com/client/v4/zones/$zoneId/settings/always_use_https" @{ value = "on" } | Out-Null
    Write-Ok "SSL + HTTPS enforced"
  } catch { Write-Warn "SSL settings: $_" }

  if ($TargetZoneName -eq $ZoneName) {
    # Remove Pages custom domains (conflict with Worker routes -> HTTP 500)
    try {
      $domains = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$PagesProject/domains"
      foreach ($d in $domains) {
        try {
          Invoke-CfApi DELETE "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$PagesProject/domains/$($d.name)" | Out-Null
          Write-Ok "Removed Pages domain $($d.name)"
        } catch {}
      }
    } catch { Write-Warn "Pages domain cleanup: $_" }
  }

  # Remove Pages CNAME records and GoDaddy parking A records
  try {
    $records = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?per_page=100"
    foreach ($rec in $records) {
      if ($rec.type -eq "CNAME" -and $rec.content -match "\.pages\.dev$") {
        Invoke-CfApi DELETE "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($rec.id)" | Out-Null
        Write-Ok "Removed Pages CNAME $($rec.name)"
      }
      if ($rec.type -eq "A" -and ($rec.content -match "^15\.197\.|^3\.33\.130\.|^184\.168\.|^160\.153\.")) {
        Invoke-CfApi DELETE "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($rec.id)" | Out-Null
        Write-Ok "Deleted parking A record $($rec.content)"
      }
    }
  } catch { Write-Warn "DNS cleanup: $_" }

  # Point apex + www to Worker (proxied AAAA)
  foreach ($rec in @(
    @{ type = "AAAA"; name = $TargetZoneName; content = "100::"; proxied = $true },
    @{ type = "AAAA"; name = "www"; content = "100::"; proxied = $true }
  )) {
    $qName = if ($rec.name -eq $TargetZoneName) { $TargetZoneName } else { "$($rec.name).$TargetZoneName" }
    $existing = @(Invoke-CfApi GET "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?name=$qName&type=$($rec.type)")
    if ($existing.Count -gt 0) {
      Invoke-CfApi PATCH "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($existing[0].id)" -Body $rec | Out-Null
      Write-Ok "Updated DNS $($rec.name) on $TargetZoneName"
    } else {
      Invoke-CfApi POST "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" -Body $rec | Out-Null
      Write-Ok "Created DNS $($rec.name) on $TargetZoneName"
    }
  }

  # Worker routes for entire site + API
  $patterns = @(
    "$TargetZoneName/*",
    "www.$TargetZoneName/*"
  )
  try {
    $routes = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/zones/$zoneId/workers/routes"
    foreach ($old in $routes) {
      if ($old.pattern -match '/api/\*') {
        Invoke-CfApi DELETE "https://api.cloudflare.com/client/v4/zones/$zoneId/workers/routes/$($old.id)" | Out-Null
        Write-Ok "Removed old route $($old.pattern)"
      }
    }
    foreach ($pattern in $patterns) {
      $exists = $routes | Where-Object { $_.pattern -eq $pattern }
      if (-not $exists) {
        Invoke-CfApi POST "https://api.cloudflare.com/client/v4/zones/$zoneId/workers/routes" `
          @{ pattern = $pattern; script = $WorkerName } | Out-Null
      }
      Write-Ok "Worker route $pattern"
    }
  } catch { Write-Warn "Worker routes: $_" }

  try {
    Invoke-CfApi POST "https://api.cloudflare.com/client/v4/zones/$zoneId/purge_cache" @{ purge_everything = $true } | Out-Null
    Write-Ok "Cache purged for $TargetZoneName"
  } catch { Write-Warn "Cache purge: $_" }

  return $true
}

# --- Main ---
Write-Host "Nexa Trials - Cloudflare deploy" -ForegroundColor Cyan
Write-Host "Domain: $ZoneName" -ForegroundColor Gray

Get-CloudflareAuth

if (-not $WorkerOnly) {
  Write-Warn "Skipping Pages deploy (direct upload returns HTTP 500 on this account). Site served via Worker."
}

if (-not $PagesOnly) {
  Deploy-Worker
}

$primaryZone = $null
$legacyZone = $null
$dnsReady = $false
if (-not $PagesOnly) {
  $primaryZone = Get-ZoneId $ZoneName
  if ($primaryZone) {
    $dnsReady = [bool](Configure-DnsAndRoutes -TargetZoneName $ZoneName)
  }
  $legacyZone = Get-ZoneId $LegacyZoneName
  if ($legacyZone) {
    Configure-DnsAndRoutes -TargetZoneName $LegacyZoneName | Out-Null
  }
}

$nameservers = @()
if ($primaryZone -and $primaryZone.name_servers) {
  $nameservers = @($primaryZone.name_servers)
}

$out = @{
  siteUrl       = "https://$ZoneName"
  legacySiteUrl = "https://$LegacyZoneName"
  apiHealth     = "https://$ZoneName/api/health"
  worker        = $WorkerName
  hosting       = "cloudflare-worker"
  deployedAt    = (Get-Date).ToUniversalTime().ToString("o")
  dnsReady      = $dnsReady
  zoneStatus    = if ($primaryZone) { $primaryZone.status } else { "missing" }
  nameservers   = $nameservers
}
$out | ConvertTo-Json | Set-Content (Join-Path $Root "deploy-output.json") -Encoding UTF8

Write-Host ""
Write-Host "=== DEPLOY COMPLETE ===" -ForegroundColor Green
Write-Host "Site:    https://$ZoneName"
Write-Host "Legacy:  https://$LegacyZoneName (redirects to $ZoneName)"
Write-Host "API:     https://$ZoneName/api/health"
if ($primaryZone -and $primaryZone.status -ne "active") {
  Write-Host ""
  Write-Warn "Next: Point GoDaddy nameservers for $ZoneName to: $($nameservers -join ', ')"
  Write-Warn "Run: .\update-godaddy-ns.ps1 -ApiKey <key> -ApiSecret <secret> -Domain $ZoneName"
}
