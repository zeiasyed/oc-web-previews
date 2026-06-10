# Commit and push repo changes to GitHub (postcards, sites, landing, etc.)
# Requires Git for Windows: https://git-scm.com/download/win
Set-Location $PSScriptRoot\..

$git = $null
foreach ($candidate in @(
    "git",
    "$env:ProgramFiles\Git\bin\git.exe",
    "${env:ProgramFiles(x86)}\Git\bin\git.exe",
    "$env:LocalAppData\Programs\Git\bin\git.exe",
    "C:\ProgramData\zeias\GitHubDesktop\app-3.5.12\resources\app\git\cmd\git.exe"
)) {
    if ($candidate -eq "git") {
        $found = Get-Command git -ErrorAction SilentlyContinue
        if ($found) { $git = "git"; break }
    } elseif (Test-Path $candidate) {
        $git = $candidate
        break
    }
}

if (-not $git) {
    Write-Error "Git not found. Install Git for Windows, then re-run: .\scripts\publish_to_github.ps1"
    exit 1
}

$msg = if ($args.Count -gt 0) { $args -join " " } else { "Update postcards and preview assets" }

& $git add postcards/templates postcards/png postcards/qr config/branding.json landing/assets/branding.js
& $git add previews landing
& $git status --short
& $git commit -m $msg
if ($LASTEXITCODE -ne 0) {
    Write-Host "Nothing to commit or commit failed."
    exit $LASTEXITCODE
}
& $git push
Write-Host "Published to GitHub."
