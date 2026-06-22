$ErrorActionPreference = "Stop"
$Api = "https://renu-california-photo-extractor-api.zeiasyed.workers.dev"
$Headers = @{ "User-Agent" = "ReNuCaliforniaTest/1.0" }

Write-Host "1. Health"
$health = Invoke-RestMethod -Uri "$Api/health" -Headers $Headers
if (-not $health.ok) { throw "Health failed" }
Write-Host "   OK $($health.service)"

Write-Host "2. Login"
$login = Invoke-RestMethod -Method POST -Uri "$Api/api/login" -Headers $Headers `
  -ContentType "application/json" `
  -Body '{"userName":"California","shopPassword":"renucalifornia"}'
$token = $login.token
$auth = @{ Authorization = "Bearer $token"; "User-Agent" = "ReNuCaliforniaTest/1.0" }
Write-Host "   OK session"

Write-Host "3. QBO status"
$qboStatus = Invoke-RestMethod -Uri "$Api/api/qbo/status" -Headers $auth
Write-Host "   connected: $($qboStatus.connected) configured: $($qboStatus.configured)"

Write-Host "4. ARI invoice groups"
$ari = Invoke-RestMethod -Method POST -Uri "$Api/api/invoice-generator/invoices" -Headers $auth `
  -ContentType "application/json" `
  -Body '{"clientName":"Autonation Toyota Irvine","dateFrom":"2026-01-01","dateTo":"2026-06-30"}' `
  -TimeoutSec 180
$ariTotal = ($ari.invoiceGroups | ForEach-Object { [double]$_.total } | Measure-Object -Sum).Sum
Write-Host "   $($ari.invoiceGroups.Count) groups, ARI total $($ariTotal)"

if ($qboStatus.connected) {
  Write-Host "5. QBO open invoices"
  $qbo = Invoke-RestMethod -Method POST -Uri "$Api/api/invoice-generator/qbo-invoices" -Headers $auth `
    -ContentType "application/json" `
    -Body '{"clientName":"Autonation Toyota Irvine","dateFrom":"2026-01-01","dateTo":"2026-06-30"}' `
    -TimeoutSec 180
  Write-Host "   $($qbo.invoiceGroups.Count) open invoices, QBO open total $($qbo.qboOpenTotal)"
  foreach ($g in $qbo.invoiceGroups | Select-Object -First 5) {
    $carSum = ($g.cars | ForEach-Object { [double]$_.amount } | Measure-Object -Sum).Sum
    Write-Host "   $($g.invoiceNumber): balance $($g.total) car sum $carSum"
    if ([math]::Abs([double]$g.total - $carSum) -gt 0.05) { throw "Balance mismatch" }
  }
} else {
  Write-Host "5. QBO load skipped (not connected)"
}

Write-Host "6. QBO auth-url guard"
try {
  Invoke-RestMethod -Uri "$Api/api/qbo/auth-url" -Headers $auth | Out-Null
  if (-not $qboStatus.configured) { throw "auth-url should fail when QBO not configured" }
  Write-Host "   OK auth URL returned"
} catch {
  if ($qboStatus.configured) { throw $_ }
  Write-Host "   OK blocked until QBO secrets are set"
}

Write-Host ""
Write-Host "API smoke tests passed." -ForegroundColor Green
