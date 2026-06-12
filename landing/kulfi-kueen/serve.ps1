# Local preview server - open on iPhone: http://<your-pc-ip>:8080
$port = 5500
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "  Kulfi Kueen - local preview" -ForegroundColor Magenta
Write-Host "  PC:     http://localhost:$port" -ForegroundColor Cyan
if ($ip) {
  Write-Host "  iPhone: http://${ip}:$port" -ForegroundColor Green
  Write-Host "  (Same Wi-Fi required)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

Set-Location $PSScriptRoot
python -m http.server $port --bind 0.0.0.0
