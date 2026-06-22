$resp = Invoke-WebRequest -Uri "https://renu-california-photo-extractor-api.zeiasyed.workers.dev/" `
  -Headers @{ "User-Agent" = "ReNuCaliforniaTest/1.0" } -UseBasicParsing
Write-Host "PDF upload:" ($resp.Content -match "inv-qbo-pdfs")
Write-Host "CSV upload:" ($resp.Content -match "inv-qbo-csv")
Write-Host "Garbled:" ($resp.Content -match "â")
