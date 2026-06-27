$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Creating virtual environment..."
  python -m venv .venv
  .\.venv\Scripts\pip install -r requirements.txt
}

$py = Join-Path $root ".venv\Scripts\python.exe"

Write-Host "Starting Mock Medidata Rave on port 5051..."
Start-Process -FilePath $py -ArgumentList "mock_rave\app.py" -WorkingDirectory $root -WindowStyle Minimized

Start-Sleep -Seconds 1

Write-Host "Starting Nexa Source Flow console on port 5050..."
& $py console\app.py
