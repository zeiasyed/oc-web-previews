# Local preview server — required for new-tab links and fetch to work reliably.
# Usage: .\serve.ps1
# Then open: http://localhost:8080/landing/connect.html?biz=YOUR-SLUG

$port = 8080
$root = $PSScriptRoot

Write-Host "Serving Solena Digital previews at http://localhost:$port"
Write-Host "Landing page: http://localhost:$port/landing/connect.html?biz=pacific-coast-hvac-demo"
Write-Host "Press Ctrl+C to stop."
Set-Location $root
python -m http.server $port
