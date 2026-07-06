#Requires -Version 5.1
# Fix cloudflared "localhost" -> IPv6 [::1] while Flask binds 127.0.0.1 only (502 on demo-direct).
# Updates remote tunnel ingress to use 127.0.0.1 explicitly.

$ErrorActionPreference = "Stop"
$TrialsRoot = $PSScriptRoot | Split-Path -Parent
$CredsFile = Join-Path $TrialsRoot ".cloudflare-credentials.json"
$TunnelFile = Join-Path $TrialsRoot ".cloudflare-tunnel.local.json"

$cf = Get-Content $CredsFile -Raw | ConvertFrom-Json
$tunnel = Get-Content $TunnelFile -Raw | ConvertFrom-Json
$headers = @{ "X-Auth-Email" = $cf.email; "X-Auth-Key" = $cf.globalKey }

$accountId = (Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts?per_page=5" -Headers $headers).result[0].id
$body = @{
  config = @{
    ingress = @(
      @{ hostname = "demo-direct.nexa-trials.com"; service = "http://127.0.0.1:5070" }
      @{ hostname = "demo-edc.nexa-trials.com"; service = "http://127.0.0.1:5071" }
      @{ hostname = "demo-source.nexa-trials.com"; service = "http://127.0.0.1:5050" }
      @{ hostname = "demo-source-edc.nexa-trials.com"; service = "http://127.0.0.1:5051" }
      @{ service = "http_status:404" }
    )
  }
} | ConvertTo-Json -Depth 6

$uri = "https://api.cloudflare.com/client/v4/accounts/$accountId/cfd_tunnel/$($tunnel.tunnelId)/configurations"
$r = Invoke-RestMethod -Method PUT -Uri $uri -Headers $headers -ContentType "application/json" -Body $body
if (-not $r.success) { throw "Tunnel config update failed" }
Write-Host "OK  Tunnel ingress now uses 127.0.0.1 (restart cloudflared if still 502)." -ForegroundColor Green
