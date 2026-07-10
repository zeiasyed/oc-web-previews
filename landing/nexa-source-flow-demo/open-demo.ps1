$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Test-PortListening($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-PortListening 5050) -or -not (Test-PortListening 5051)) {
  Write-Host "Demo servers not running - starting them..."
  & (Join-Path $root "run_demo.ps1")
  exit $LASTEXITCODE
}

Write-Host "Opening NexaFlow console..."
Start-Process "http://127.0.0.1:5050"
