# Generate TX plumber preview sites + postcards from data/tx-plumbers-50.csv
Set-Location $PSScriptRoot\..

python scripts/prepare_tx_batch.py --limit 50
python scripts/generate_site.py --csv data/tx-plumbers-50.csv
python scripts/sync_branding.py
python scripts/generate_postcards.py --csv data/tx-plumbers-50.csv
python scripts/build_tx_index.py --csv data/tx-plumbers-50.csv
& "$PSScriptRoot\publish_to_github.ps1" "Add TX plumber batch: 50 sites and postcards"
