$ErrorActionPreference = "Stop"
$Api = "https://renu-california-photo-extractor-api.zeiasyed.workers.dev"
$Headers = @{ "User-Agent" = "ReNuCaliforniaTest/1.0" }

$login = Invoke-RestMethod -Method POST -Uri "$Api/api/login" -Headers $Headers `
  -ContentType "application/json" `
  -Body '{"userName":"California","shopPassword":"renucalifornia"}'
$auth = @{ Authorization = "Bearer $($login.token)"; "User-Agent" = "ReNuCaliforniaTest/1.0" }

# ATI-1000 sample: 4 cars @ $130 = $520
$body = @{
  clientName = "Autonation Toyota Irvine"
  dateFrom   = "2026-01-01"
  dateTo     = "2026-06-30"
  qboInvoices = @(
    @{
      DocNumber = "ATI-1000"
      TxnDate   = "2026-03-24"
      Balance   = 520
      TotalAmt  = 520
      Line      = @(
        @{ DetailType = "SalesItemLineDetail"; Amount = 130; Description = "2023 Toyota Tundra Limited VIN 5TFJA5DB4PX120685" }
        @{ DetailType = "SalesItemLineDetail"; Amount = 130; Description = "2021 Ford Ranger LARIAT VIN 1FTER4FH2MLD37936" }
        @{ DetailType = "SalesItemLineDetail"; Amount = 130; Description = "2023 Toyota Camry VIN 1HGCM82633A004352" }
        @{ DetailType = "SalesItemLineDetail"; Amount = 130; Description = "2024 Toyota Corolla VIN 2T1BURHE0JC123456" }
      )
    }
  )
} | ConvertTo-Json -Depth 6 -Compress

$result = Invoke-RestMethod -Method POST -Uri "$Api/api/invoice-generator/import-merge" -Headers $auth `
  -ContentType "application/json" -Body $body -TimeoutSec 180

if ($result.invoiceGroups.Count -ne 1) { throw "Expected 1 invoice group" }
$g = $result.invoiceGroups[0]
if ($g.total -ne 520) { throw "Expected total 520, got $($g.total)" }
if ($g.cars.Count -ne 4) { throw "Expected 4 cars, got $($g.cars.Count)" }
$carSum = ($g.cars | ForEach-Object { [double]$_.amount } | Measure-Object -Sum).Sum
if ([math]::Abs($carSum - 520) -gt 0.02) { throw "Car sum mismatch: $carSum" }

Write-Host "import-merge test passed: $($g.invoiceNumber) total $($g.total) cars $($g.cars.Count)" -ForegroundColor Green
