$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Virtual environment missing. Run .\setup.ps1 first."
  exit 1
}

$py = Join-Path $root ".venv\Scripts\python.exe"

function Stop-DemoPort($port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

function Test-PortListening($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Port($port, $label, $timeoutSec = 25) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortListening $port) {
      Write-Host "  $label ready on port $port"
      return $true
    }
    Start-Sleep -Milliseconds 400
  }
  Write-Host "  ERROR: $label did not start on port $port"
  return $false
}

Write-Host "Stopping any existing demo processes on ports 5070 and 5071..."
Stop-DemoPort 5071
Stop-DemoPort 5070
Start-Sleep -Seconds 2

Write-Host "Starting Mock Medidata Rave on port 5071..."
Start-Process -FilePath $py -ArgumentList "mock_rave\app.py" -WorkingDirectory $root -WindowStyle Minimized

Start-Sleep -Seconds 1

Write-Host "Starting NexaDirect console on port 5070..."
Start-Process -FilePath $py -ArgumentList "console\app.py" -WorkingDirectory $root -WindowStyle Minimized

$raveOk = Wait-Port 5071 "Mock EDC"
$consoleOk = Wait-Port 5070 "Console"

if ($consoleOk) {
  try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:5070/api/build" -UseBasicParsing -TimeoutSec 8
    Write-Host "  Console build: $($health.Content)"
  } catch {
    Write-Host "  WARNING: Console HTTP check failed: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "Console:  http://127.0.0.1:5070"
Write-Host "Mock EDC: http://127.0.0.1:5071"
Write-Host ""

if ($consoleOk) {
  Start-Process "http://127.0.0.1:5070/"
} else {
  Write-Host "Could not open browser — console failed to start."
  Write-Host "Run .\setup.ps1 first, then .\run_demo.ps1 again."
  exit 1
}

if (-not $raveOk) {
  Write-Host "Mock EDC may not be available yet — verify step may fail until port 5071 is up."
}
