#Requires -Version 5.1
param(
  [string]$ShopPassword = "renu123",
  [string]$EncryptionKey = "ari-photo-extractor-key-32charsxx"
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$WorkerRoot = Join-Path $Root "worker"
$AppRoot = Join-Path $Root "app"
$AccountId = "0f61b15e3b7ef041399aed19c79e6e7e"
$WorkerName = "ari-photo-extractor-api"
$DbName = "ari-photo-extractor"
$CredsFile = Join-Path (Join-Path $Root "..\toledo-swift-haul-dashboard") ".cloudflare-credentials.json"

function Get-CfHeaders {
  if (-not (Test-Path $CredsFile)) { throw "Missing Cloudflare credentials at $CredsFile" }
  $c = Get-Content $CredsFile -Raw | ConvertFrom-Json
  if ($c.type -eq "token") {
    return @{ Authorization = "Bearer $($c.token)" }
  }
  return @{
    "X-Auth-Email" = $c.email
    "X-Auth-Key"   = $c.globalKey
  }
}

function Invoke-Cf([string]$Method, [string]$Uri, $Body = $null) {
  $headers = Get-CfHeaders
  if ($Body -ne $null) {
    $headers["Content-Type"] = "application/json"
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body ($Body | ConvertTo-Json -Depth 10 -Compress)
  }
  return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
}

function Build-WorkerBundle {
  $crypto = Get-Content (Join-Path $WorkerRoot "crypto.js") -Raw
  $ari = Get-Content (Join-Path $WorkerRoot "ari-firebase.js") -Raw
  $index = Get-Content (Join-Path $WorkerRoot "index.js") -Raw
  $html = Get-Content (Join-Path $AppRoot "index.html") -Raw
  $css = Get-Content (Join-Path $AppRoot "styles.css") -Raw
  $js = Get-Content (Join-Path $AppRoot "app.js") -Raw

  $crypto = $crypto -replace 'export async function ', 'async function '
  $ari = $ari -replace 'export async function ', 'async function '
  $index = $index -replace 'import \{ encryptText, decryptText \} from "\./crypto\.js";\r?\n', ''
  $index = $index -replace 'import \{ fetchAriInvoices, listAriClients \} from "\./ari-firebase\.js";\r?\n', ''

  $htmlB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($html))
  $cssB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($css))
  $jsB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($js))

  $static = @"
const APP_B64 = {
  "index.html": "$htmlB64",
  "styles.css": "$cssB64",
  "app.js": "$jsB64",
};

function serveStatic(pathname) {
  let file = pathname;
  if (file === "/" || file === "") file = "/index.html";
  file = file.replace(/^\//, "");
  const encoded = APP_B64[file];
  if (!encoded) return null;
  const text = atob(encoded);
  const type = file.endsWith(".html")
    ? "text/html; charset=utf-8"
    : file.endsWith(".css")
      ? "text/css; charset=utf-8"
      : "application/javascript; charset=utf-8";
  return new Response(text, { headers: { ...CORS, "Content-Type": type } });
}

"@

  return ($static + $crypto + "`n`n" + $ari + "`n`n" + $index)
}

function Get-OrCreate-D1 {
  Write-Host ">> D1 database" -ForegroundColor Cyan
  $list = Invoke-Cf GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database"
  $existing = $list.result | Where-Object { $_.name -eq $DbName } | Select-Object -First 1
  if ($existing) {
    Write-Host "   OK  Using existing D1: $($existing.uuid)" -ForegroundColor Green
    return $existing.uuid
  }
  $created = Invoke-Cf POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database" @{ name = $DbName }
  if (-not $created.success) { throw "D1 create failed" }
  Write-Host "   OK  Created D1: $($created.result.uuid)" -ForegroundColor Green
  return $created.result.uuid
}

function Initialize-Schema([string]$DbId) {
  Write-Host ">> D1 schema" -ForegroundColor Cyan
  $sql = Get-Content (Join-Path $WorkerRoot "schema.sql") -Raw
  $statements = $sql -split ";" | Where-Object { $_.Trim() -ne "" }
  foreach ($stmt in $statements) {
    $body = @{ sql = $stmt.Trim() }
    Invoke-Cf POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database/$DbId/query" $body | Out-Null
  }
  Write-Host "   OK  Schema applied" -ForegroundColor Green
}

function Set-WorkerSecret([string]$Name, [string]$Value) {
  Invoke-Cf PUT "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName/secrets" @{
    name = $Name
    text = $Value
    type = "secret_text"
  } | Out-Null
}

function Deploy-Worker([string]$DbId) {
  Write-Host ">> Worker deploy ($WorkerName)" -ForegroundColor Cyan

  try {
    Set-WorkerSecret "SHOP_PASSWORD" $ShopPassword
    Set-WorkerSecret "ENCRYPTION_KEY" $EncryptionKey
    Write-Host "   OK  Secrets set" -ForegroundColor Green
  } catch {
    Write-Host "   !!  Secrets: $_" -ForegroundColor Yellow
  }

  $bindings = @(
    @{ type = "d1"; name = "DB"; id = $DbId }
  )

  $metadata = @{
    main_module = "index.js"
    bindings    = $bindings
  } | ConvertTo-Json -Depth 8 -Compress

  $workerCode = Build-WorkerBundle
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
  $headers = Get-CfHeaders
  Invoke-RestMethod -Method PUT `
    -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName" `
    -Headers $headers `
    -ContentType "multipart/form-data; boundary=$boundary" `
    -Body $bodyBytes | Out-Null
  Write-Host "   OK  Worker uploaded" -ForegroundColor Green

  $subdomain = "$WorkerName.$AccountId"
  try {
    Invoke-Cf POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName/subdomain" @{ enabled = $true } | Out-Null
  } catch { }

  return "https://$WorkerName.zeiasyed.workers.dev"
}

function Deploy-GitHubPages {
  Write-Host ">> GitHub Pages (oc-web-previews)" -ForegroundColor Cyan
  $pagesRoot = Join-Path $Root "gh-pages"
  if (Test-Path $pagesRoot) { Remove-Item $pagesRoot -Recurse -Force }
  New-Item -ItemType Directory -Path $pagesRoot | Out-Null
  Copy-Item (Join-Path $AppRoot "*") $pagesRoot -Recurse

  $apiUrl = $script:ApiUrl
  $indexPath = Join-Path $pagesRoot "index.html"
  $html = Get-Content $indexPath -Raw
  if ($html -notmatch 'value="https://') {
    $html = $html.Replace('placeholder="https://ari-photo-extractor-api.your-account.workers.dev"', ('value="' + $apiUrl + '"'))
    $html | Set-Content $indexPath -Encoding UTF8 -NoNewline
  }

  $repoRoot = Resolve-Path (Join-Path $Root "..")
  Push-Location $repoRoot
  try {
    git add "ari-photo-extractor/gh-pages"
    git add "ari-photo-extractor/deploy.ps1"
    git add "ari-photo-extractor/worker"
    git add "ari-photo-extractor/app"
    git add "ari-photo-extractor/README.md"
    git add "ari-photo-extractor/DEPLOYMENT.md"
    git status --short ari-photo-extractor
    git commit -m "Add ARI Photo Extractor app and API deploy assets"
    git push origin main
    Write-Host "   OK  Pushed to origin/main" -ForegroundColor Green
    Write-Host "   Pages URL (after enabling): https://zeiasyed.github.io/oc-web-previews/landing/ari-photo-extractor/gh-pages/" -ForegroundColor Green
  } catch {
    Write-Host "   !!  Git push: $_" -ForegroundColor Yellow
    Write-Host "   Copy gh-pages/ manually or enable GitHub Pages on this path." -ForegroundColor Yellow
  } finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host "ARI Photo Extractor - deploy" -ForegroundColor White
$dbId = Get-OrCreate-D1
Initialize-Schema $dbId
$workerUrl = Deploy-Worker $dbId
$script:ApiUrl = "https://$WorkerName.zeiasyed.workers.dev"

try {
  $health = Invoke-RestMethod -Uri "$script:ApiUrl/health"
  Write-Host "   OK  API health: $($health.service)" -ForegroundColor Green
} catch {
  Write-Host "   !!  API health check failed: $_" -ForegroundColor Yellow
}

Deploy-GitHubPages

$out = @{
  apiUrl            = $script:ApiUrl
  shopPassword      = $ShopPassword
  workerName        = $WorkerName
  d1Id              = $dbId
  pagesPath         = "landing/ari-photo-extractor/gh-pages/"
  deployedAt        = (Get-Date).ToString("o")
}
$out | ConvertTo-Json | Set-Content (Join-Path $Root "deploy-output.json") -Encoding UTF8

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "API:      $script:ApiUrl"
Write-Host "Password: $ShopPassword"
Write-Host "Pages:    https://zeiasyed.github.io/oc-web-previews/landing/ari-photo-extractor/gh-pages/"
