# Generate trade preview sites from trades-50.csv
# Usage: .\run_trades.ps1
#        .\run_trades.ps1 -Demo   # preview all 3 trade templates
Set-Location $PSScriptRoot

$csv = if ($Demo) { "data/trade-templates-demo.csv" } else { "data/trades-200.csv" }

python scripts/generate_site.py --csv $csv
python scripts/generate_postcards.py --csv $csv --landscape --template
python scripts/publish_to_github.ps1 "Regenerate trade postcards from PDF template"
