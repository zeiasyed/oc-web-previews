#Requires -Version 5.1
# Manage client demo video logins (Cloudflare KV + VPS video storage on nexa-trials.com).
#
# First time:
#   .\manage-client-demos.ps1 -Action setup
#   .\deploy-cloudflare.ps1 -WorkerOnly
#
# Upload a video:
#   .\manage-client-demos.ps1 -Action upload-video -VideoId nexadirect-quick -Title "NexaDirect Quick Demo" -File "C:\path\video.mp4"
#
# Create a client (14-day access by default):
#   .\manage-client-demos.ps1 -Action new-client -Username acme -Label "Acme Pharma" -VideoIds nexadirect-quick
#
# List clients:
#   .\manage-client-demos.ps1 -Action list-clients
#
# Revoke:
#   .\manage-client-demos.ps1 -Action revoke-client -Username acme

param(
  [ValidateSet("setup", "upload-video", "register-video", "new-client", "list-clients", "revoke-client", "list-videos")]
  [string]$Action = "list-clients",
  [string]$VideoId,
  [string]$Title,
  [string]$Description,
  [string]$File,
  [string]$Username,
  [string]$Label,
  [string[]]$VideoIds,
  [int]$Days = 14
)

$ErrorActionPreference = "Stop"
$MarketingRoot = $PSScriptRoot
$TrialsRoot = Split-Path $MarketingRoot -Parent
$AccountId = "0f61b15e3b7ef041399aed19c79e6e7e"
$WorkerName = "nexa-trials-api"
$StateFile = Join-Path $TrialsRoot ".client-demos-state.local.json"
$CredsFile = Join-Path $TrialsRoot ".cloudflare-credentials.json"
$VpsStateFile = Join-Path $TrialsRoot ".nexa-labs-vps-state.json"
$SshKey = Join-Path $env:USERPROFILE ".ssh\nexa-labs_ed25519"
$R2Bucket = "nexa-client-demo-videos"
$KvTitle = "nexa-client-demos"
$VpsVideoDir = "/opt/nexa-labs/data/client-videos"

function Write-Step([string]$Msg) { Write-Host "`n>> $Msg" -ForegroundColor Cyan }
function Write-Ok([string]$Msg) { Write-Host "   OK  $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg) { Write-Host "   !!  $Msg" -ForegroundColor Yellow }

function Get-CfHeaders {
  $cf = Get-Content $CredsFile -Raw | ConvertFrom-Json
  if ($cf.globalKey) {
    return @{ "X-Auth-Email" = $cf.email; "X-Auth-Key" = $cf.globalKey }
  }
  throw "Missing Cloudflare credentials in $CredsFile"
}

function Invoke-CfApi {
  param([string]$Method, [string]$Uri, $Body, [string]$ContentType = "application/json")
  $headers = Get-CfHeaders
  $params = @{ Method = $Method; Uri = $Uri; Headers = $headers }
  if ($null -ne $Body) {
    if ($Body -is [byte[]]) {
      $params.Body = $Body
      $params.ContentType = $ContentType
    } else {
      $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
      $params.ContentType = "application/json"
    }
  }
  return Invoke-RestMethod @params
}

function Get-DemoState {
  if (-not (Test-Path $StateFile)) { return $null }
  return Get-Content $StateFile -Raw | ConvertFrom-Json
}

function Save-DemoState($state) {
  $state | ConvertTo-Json -Depth 4 | Set-Content $StateFile -Encoding UTF8
}

function New-RandomString([int]$Length = 16) {
  $chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  -join ((1..$Length) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

function Get-DemoPasswordHash([string]$Password, [string]$Salt) {
  $derive = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
    [Text.Encoding]::UTF8.GetBytes($Password),
    [Text.Encoding]::UTF8.GetBytes($Salt),
    100000,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256
  )
  try {
    $bytes = $derive.GetBytes(32)
    return ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
  } finally {
    $derive.Dispose()
  }
}

function Get-VpsState {
  if (-not (Test-Path $VpsStateFile)) {
    throw "Missing $VpsStateFile - provision the Hetzner VPS first"
  }
  return Get-Content $VpsStateFile -Raw | ConvertFrom-Json
}

function Invoke-VpsSsh([string]$RemoteCommand) {
  $vps = Get-VpsState
  if (-not (Test-Path $SshKey)) { throw "Missing SSH key: $SshKey" }
  & ssh -i $SshKey -o StrictHostKeyChecking=accept-new "root@$($vps.publicIp)" $RemoteCommand
  if ($LASTEXITCODE -ne 0) { throw "SSH command failed (exit $LASTEXITCODE)" }
}

function Ensure-VpsVideoOrigin([string]$Secret) {
  $vps = Get-VpsState
  $authConf = @"
if (`$arg_key != "$Secret") {
  return 403;
}
"@
  $authPath = [IO.Path]::GetTempFileName()
  try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($authPath, $authConf, $utf8NoBom)
    & scp -i $SshKey -o StrictHostKeyChecking=accept-new $authPath "root@$($vps.publicIp):/etc/nginx/nexa-video-auth.conf"
    if ($LASTEXITCODE -ne 0) { throw "SCP auth config failed" }
  } finally {
    Remove-Item $authPath -Force -ErrorAction SilentlyContinue
  }
  $remote = @(
    "mkdir -p $VpsVideoDir"
    "printf '%s\n' '$Secret' > /opt/nexa-labs/.video-origin-secret"
    "chmod 600 /opt/nexa-labs/.video-origin-secret"
    "nginx -t && systemctl reload nginx"
  ) -join " && "
  Invoke-VpsSsh $remote
  Write-Ok "VPS video origin secret synced to $($vps.publicIp)"
}

function Upload-VpsObject([string]$ObjectKey, [string]$LocalPath) {
  $vps = Get-VpsState
  if (-not (Test-Path $LocalPath)) { throw "File not found: $LocalPath" }
  if (-not (Test-Path $SshKey)) { throw "Missing SSH key: $SshKey" }
  Invoke-VpsSsh "mkdir -p $VpsVideoDir"
  & scp -i $SshKey -o StrictHostKeyChecking=accept-new $LocalPath "root@$($vps.publicIp):$VpsVideoDir/$ObjectKey"
  if ($LASTEXITCODE -ne 0) { throw "SCP upload failed (exit $LASTEXITCODE)" }
  Write-Ok "Uploaded to VPS: $VpsVideoDir/$ObjectKey"
}

function Ensure-Setup {
  $state = Get-DemoState
  if ($state -and $state.kvNamespaceId -and $state.videoOriginBase -and $state.videoOriginSecret) { return $state }

  Write-Step "Provisioning Cloudflare KV + VPS video origin for client demos"
  if (-not (Test-Path $CredsFile)) { throw "Missing $CredsFile" }

  $kvId = $null
  $namespaces = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/storage/kv/namespaces?per_page=100"
  $existingKv = $namespaces.result | Where-Object { $_.title -eq $KvTitle } | Select-Object -First 1
  if ($existingKv) {
    $kvId = $existingKv.id
    Write-Ok "KV namespace exists: $kvId"
  } else {
    $created = Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/storage/kv/namespaces" @{ title = $KvTitle }
    $kvId = $created.result.id
    Write-Ok "Created KV namespace: $kvId"
  }

  try {
    Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/r2/buckets" @{ name = $R2Bucket; location = "WNAM" } | Out-Null
    Write-Ok "Created R2 bucket: $R2Bucket (optional)"
  } catch {
    Write-Warn "R2 not available on this account - using VPS video storage instead"
  }

  $vps = Get-VpsState
  $videoOriginSecret = if ($state -and $state.videoOriginSecret) { $state.videoOriginSecret } else { New-RandomString 20 }
  $videoOriginBase = "http://demo-videos.nexa-trials.com/videos"
  Ensure-VpsVideoOrigin $videoOriginSecret

  $sessionSecret = New-RandomString 48
  try {
    $boundary = [guid]::NewGuid().ToString()
    $metaJson = "[{`"name`":`"CLIENT_DEMO_SESSION_SECRET`",`"text`":`"$sessionSecret`",`"type`":`"secret_text`"}]"
    $lf = "`r`n"
    $body = [Text.Encoding]::UTF8.GetBytes(
      "--$boundary$lf" +
      "Content-Disposition: form-data; name=`"metadata`"$lf" +
      "Content-Type: application/json$lf$lf" +
      "$metaJson$lf" +
      "--$boundary--$lf"
    )
    $headers = Get-CfHeaders
    Invoke-RestMethod -Method PUT `
      -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName/secrets" `
      -Headers $headers `
      -ContentType "multipart/form-data; boundary=$boundary" `
      -Body $body | Out-Null
    Write-Ok "Worker secret CLIENT_DEMO_SESSION_SECRET set"
  } catch {
    Write-Warn "Could not set worker secret via API: $($_.Exception.Message)"
    Write-Warn "Run: wrangler secret put CLIENT_DEMO_SESSION_SECRET --name $WorkerName"
  }

  $state = [PSCustomObject]@{
    kvNamespaceId = $kvId
    r2BucketName = $R2Bucket
    videoOriginBase = $videoOriginBase
    videoOriginSecret = $videoOriginSecret
    vpsPublicIp = $vps.publicIp
    created = (Get-Date).ToString("o")
  }
  Save-DemoState $state
  Write-Ok "Video origin: $videoOriginBase"
  Write-Warn "Run .\deploy-cloudflare.ps1 -WorkerOnly to attach KV + video origin to the Worker"
  return $state
}

function Put-KvValue([string]$Key, $Value) {
  $state = Ensure-Setup
  $json = if ($Value -is [string]) { $Value } else { $Value | ConvertTo-Json -Depth 6 -Compress }
  $encodedKey = [uri]::EscapeDataString($Key)
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  Invoke-CfApi PUT "https://api.cloudflare.com/client/v4/accounts/$AccountId/storage/kv/namespaces/$($state.kvNamespaceId)/values/$encodedKey" $bytes "application/json" | Out-Null
}

function Get-KvValue([string]$Key) {
  $state = Get-DemoState
  if (-not $state) { return $null }
  $encodedKey = [uri]::EscapeDataString($Key)
  try {
    return Invoke-CfApi GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/storage/kv/namespaces/$($state.kvNamespaceId)/values/$encodedKey"
  } catch {
    return $null
  }
}

function Remove-KvValue([string]$Key) {
  $state = Get-DemoState
  if (-not $state) { return }
  $encodedKey = [uri]::EscapeDataString($Key)
  Invoke-CfApi DELETE "https://api.cloudflare.com/client/v4/accounts/$AccountId/storage/kv/namespaces/$($state.kvNamespaceId)/values/$encodedKey" | Out-Null
}

function Upload-R2Object([string]$ObjectKey, [string]$LocalPath, [string]$ContentType) {
  $state = Ensure-Setup
  if (-not (Test-Path $LocalPath)) { throw "File not found: $LocalPath" }
  $bytes = [System.IO.File]::ReadAllBytes($LocalPath)

  # Global API key cannot PUT objects directly — use short-lived R2 S3 credentials.
  $creds = Invoke-CfApi POST "https://api.cloudflare.com/client/v4/accounts/$AccountId/r2/temp-access-credentials" @{
    bucket = $state.r2BucketName
    permission = "object-read-write"
    ttlSeconds = 3600
  }
  $accessKey = $creds.result.accessKeyId
  $secretKey = $creds.result.secretAccessKey
  $sessionToken = $creds.result.sessionToken
  $endpoint = "https://$AccountId.r2.cloudflarestorage.com"

  Add-Type -AssemblyName System.Web
  $date = [DateTime]::UtcNow.ToString("r")
  $resource = "/$($state.r2BucketName)/$ObjectKey"
  $stringToSign = "PUT`n`n$ContentType`n$date`nx-amz-security-token:$sessionToken`n/$($state.r2BucketName)/$ObjectKey"
  $hmac = New-Object System.Security.Cryptography.HMACSHA1
  $hmac.Key = [Text.Encoding]::UTF8.GetBytes($secretKey)
  $signature = [Convert]::ToBase64String($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($stringToSign)))
  $auth = "AWS $accessKey`:$signature"

  $headers = @{
    Authorization = $auth
    Date = $date
    "x-amz-security-token" = $sessionToken
    "Content-Type" = $ContentType
  }
  Invoke-RestMethod -Method PUT `
    -Uri "$endpoint/$($state.r2BucketName)/$ObjectKey" `
    -Headers $headers `
    -Body $bytes | Out-Null
}

function Action-RegisterVideo {
  if (-not $VideoId -or -not $Title) {
    throw "Usage: -Action register-video -VideoId id -Title 'Title' [-File path.mp4 for object name]"
  }
  $VideoId = $VideoId.ToLower() -replace '[^a-z0-9-]', '-'
  $ext = if ($File) { [IO.Path]::GetExtension($File).ToLower() } else { ".mp4" }
  if ($ext -ne ".mp4") { throw "Only .mp4 supported for now" }
  $objectKey = "$VideoId$ext"
  $meta = @{
    id = $VideoId
    title = $Title
    description = $Description
    contentType = "video/mp4"
    objectKey = $objectKey
    r2Key = $objectKey
    uploadedAt = (Get-Date).ToString("o")
  }
  Put-KvValue "video:$VideoId" $meta
  Write-Ok "Video metadata registered: $VideoId -> $objectKey"
}

function Action-UploadVideo {
  if (-not $VideoId -or -not $Title -or -not $File) {
    throw "Usage: -Action upload-video -VideoId id -Title 'Title' -File path.mp4"
  }
  $VideoId = $VideoId.ToLower() -replace '[^a-z0-9-]', '-'
  $ext = [IO.Path]::GetExtension($File).ToLower()
  if ($ext -ne ".mp4") { throw "Only .mp4 supported for now" }
  $objectKey = "$VideoId$ext"
  Write-Step "Uploading $Title -> VPS/$objectKey"
  $state = Ensure-Setup
  Ensure-VpsVideoOrigin $state.videoOriginSecret
  Upload-VpsObject $objectKey $File
  $script:File = $File
  Action-RegisterVideo
}

function Action-NewClient {
  if (-not $Username -or -not $Label -or -not $VideoIds -or $VideoIds.Count -eq 0) {
    throw "Usage: -Action new-client -Username acme -Label 'Acme Pharma' -VideoIds nexadirect-quick"
  }
  $Username = $Username.ToLower().Trim()
  $password = New-RandomString 14
  $salt = New-RandomString 24
  $hash = Get-DemoPasswordHash $password $salt
  $expiresAt = (Get-Date).AddDays($Days).ToUniversalTime().ToString("o")
  $record = @{
    username = $Username
    label = $Label
    passwordHash = $hash
    salt = $salt
    expiresAt = $expiresAt
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    videoIds = @($VideoIds)
  }
  Put-KvValue "client:$Username" $record
  Write-Ok "Client created: $Username"
  Write-Host ""
  Write-Host "  Login URL:  https://nexa-trials.com/demos/" -ForegroundColor Green
  Write-Host "  Username:   $Username" -ForegroundColor Green
  Write-Host "  Password:   $password" -ForegroundColor Green
  Write-Host "  Expires:    $((Get-Date $expiresAt).ToLocalTime().ToString('yyyy-MM-dd HH:mm'))" -ForegroundColor Green
  Write-Host "  Videos:     $($VideoIds -join ', ')" -ForegroundColor Green
  Write-Host ""
}

function Action-ListClients {
  $state = Get-DemoState
  if (-not $state) { throw "Run -Action setup first" }
  $keys = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/storage/kv/namespaces/$($state.kvNamespaceId)/keys?prefix=client:"
  if (-not $keys.result.Count) {
    Write-Host "No clients yet." -ForegroundColor Gray
    return
  }
  foreach ($k in $keys.result) {
    $name = $k.name -replace '^client:', ''
    $raw = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/storage/kv/namespaces/$($state.kvNamespaceId)/values/$([uri]::EscapeDataString($k.name))"
    if ($raw -is [string]) {
      $client = $raw | ConvertFrom-Json
    } else {
      $client = $raw
    }
    $expired = ([DateTime]$client.expiresAt) -lt (Get-Date).ToUniversalTime()
    $status = if ($expired) { "EXPIRED" } else { "active" }
    Write-Host ("{0,-20} {1,-10} {2}  videos: {3}" -f $name, $status, $client.expiresAt, ($client.videoIds -join ", "))
  }
}

function Action-ListVideos {
  $state = Get-DemoState
  if (-not $state) { throw "Run -Action setup first" }
  $keys = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/storage/kv/namespaces/$($state.kvNamespaceId)/keys?prefix=video:"
  if (-not $keys.result.Count) {
    Write-Host "No videos yet." -ForegroundColor Gray
    return
  }
  foreach ($k in $keys.result) {
    $raw = Invoke-CfApi GET "https://api.cloudflare.com/client/v4/accounts/$AccountId/storage/kv/namespaces/$($state.kvNamespaceId)/values/$([uri]::EscapeDataString($k.name))"
    if ($raw -is [string]) {
      $video = $raw | ConvertFrom-Json
    } else {
      $video = $raw
    }
    Write-Host ("{0,-24} {1}" -f $video.id, $video.title)
  }
}

function Action-RevokeClient {
  if (-not $Username) { throw "Usage: -Action revoke-client -Username acme" }
  Remove-KvValue "client:$($Username.ToLower().Trim())"
  Write-Ok "Revoked client: $Username"
}

switch ($Action) {
  "setup" { Ensure-Setup | Out-Null }
  "upload-video" { Action-UploadVideo }
  "register-video" { Action-RegisterVideo }
  "new-client" { Action-NewClient }
  "list-clients" { Action-ListClients }
  "list-videos" { Action-ListVideos }
  "revoke-client" { Action-RevokeClient }
}
