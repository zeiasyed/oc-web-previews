$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Creating virtual environment..."
  python -m venv .venv
  .\.venv\Scripts\pip install -r requirements.txt
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

Write-Host "Stopping any existing demo processes on ports 5050 and 5051..."
Stop-DemoPort 5051
Stop-DemoPort 5050
Start-Sleep -Seconds 2

Write-Host "Starting Mock Medidata Rave on port 5051..."
Start-Process -FilePath $py -ArgumentList "mock_rave\app.py" -WorkingDirectory $root -WindowStyle Minimized

Start-Sleep -Seconds 1

Write-Host "Starting NexaFlow console on port 5050..."
Start-Process -FilePath $py -ArgumentList "console\app.py" -WorkingDirectory $root -WindowStyle Minimized

$raveOk = Wait-Port 5051 "Mock EDC"
$consoleOk = Wait-Port 5050 "Console"

if ($consoleOk) {
  try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:5050/api/build" -UseBasicParsing -TimeoutSec 8
    Write-Host "  Console build: $($health.Content)"
  } catch {
    Write-Host "  WARNING: Console HTTP check failed: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "Console:  http://127.0.0.1:5050"
Write-Host "Mock EDC: http://127.0.0.1:5051"
Write-Host ""

if ($consoleOk) {
  Start-Process "http://127.0.0.1:5050/"
} else {
  Write-Host "Could not open browser — console failed to start."
  Write-Host "Run .\setup.ps1 first, then .\run_demo.ps1 again."
  exit 1
}

if (-not $raveOk) {
  Write-Host "Mock EDC may not be available yet — verify step may fail until port 5051 is up."
}
