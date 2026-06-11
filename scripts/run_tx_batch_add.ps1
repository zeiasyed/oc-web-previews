# Add more TX plumber sites/postcards (skips slugs already in a prior batch CSV).
param(
    [int]$Limit = 150,
    [string]$PriorCsv = "data/tx-plumbers-50.csv",
    [string]$NewCsv = "data/tx-plumbers-150.csv",
    [string]$MasterCsv = "data/tx-plumbers-200.csv"
)

Set-Location $PSScriptRoot\..

python scripts/prepare_tx_batch.py --limit $Limit --out $NewCsv --exclude $PriorCsv --master-out $MasterCsv
python scripts/generate_site.py --csv $NewCsv
python scripts/sync_branding.py
python scripts/generate_postcards.py --csv $NewCsv
python scripts/build_tx_index.py --csv $MasterCsv
& "$PSScriptRoot\publish_to_github.ps1" "Add TX plumber batch: $Limit more sites and postcards ($MasterCsv)"
