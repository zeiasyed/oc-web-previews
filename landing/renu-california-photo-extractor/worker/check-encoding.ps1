$resp = Invoke-WebRequest -Uri "https://renu-california-photo-extractor-api.zeiasyed.workers.dev/" `
  -Headers @{ "User-Agent" = "ReNuCaliforniaTest/1.0" } -UseBasicParsing
$bad = $resp.Content -match "â"
$good = $resp.Content -match "QuickBooks Online - open balance"
$hint = $resp.Content -match "inv-qbo-setup-hint"
Write-Host "Garbled chars:" $bad
Write-Host "Clean dash label:" $good
Write-Host "Setup hint:" $hint
