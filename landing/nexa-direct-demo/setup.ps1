$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Creating virtual environment..."
  python -m venv .venv
}

$py = Join-Path $root ".venv\Scripts\python.exe"
Write-Host "Installing dependencies..."
& $py -m pip install -q -r requirements.txt

Write-Host "Installing Playwright Chromium (for filled PDF generation)..."
& $py -m playwright install chromium

Write-Host "Building CDASH schemas..."
& $py scripts\build_cdash_schemas.py

Write-Host "Generating simulated extractions..."
& $py scripts\generate_simulated_extractions.py

Write-Host "Generating filled PDFs and seeding Scanner Inbox..."
& $py scripts\generate_filled_samples.py

Write-Host ""
Write-Host "Setup complete. Run .\run_demo.ps1 to start the demo."
