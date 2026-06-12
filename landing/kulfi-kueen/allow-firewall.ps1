# Run as Administrator: right-click -> Run with PowerShell (as Admin)
# Allows iPhone on same Wi-Fi to reach the local preview server.

$port = 5500
netsh advfirewall firewall delete rule name="Kulfi Kueen Preview" 2>$null | Out-Null
netsh advfirewall firewall add rule name="Kulfi Kueen Preview" dir=in action=allow protocol=TCP localport=$port profile=private
Write-Host "Firewall rule added for TCP port $port (Private networks)." -ForegroundColor Green
Write-Host "iPhone URL: http://192.168.1.251:$port" -ForegroundColor Cyan
