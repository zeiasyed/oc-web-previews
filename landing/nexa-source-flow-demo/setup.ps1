$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Creating virtual environment..."
  python -m venv .venv
  .\.venv\Scripts\pip install -r requirements.txt
}

$py = Join-Path $root ".venv\Scripts\python.exe"

Write-Host "Generating demo dataset..."
& $py scripts\generate_fallback_dataset.py

Write-Host "Parsing Rave HTML schemas..."
& $py scripts\parse_rave_html.py

if (Test-Path "credentials.json") {
  Write-Host "Attempting Google Drive fetch (optional)..."
  & $py scripts\fetch_assets.py
  if ($LASTEXITCODE -eq 0) {
    & $py scripts\build_demo_dataset.py
  } else {
    Write-Host "Drive fetch skipped or failed — using generated fallback dataset."
  }
} else {
  Write-Host "No credentials.json — using generated fallback dataset only."
}

Write-Host "Setup complete. Run .\run_demo.ps1 to start."
