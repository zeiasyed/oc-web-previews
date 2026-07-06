#Requires -Version 5.1
# Register Windows Scheduled Task: check lab tunnel every 5 minutes.
#
# Usage:
#   .\register-lab-watchdog.ps1
#   .\register-lab-watchdog.ps1 -Unregister

param([switch]$Unregister)

$ErrorActionPreference = "Stop"
$TaskName = "NexaLabWatchdog"
$ScriptPath = Join-Path $PSScriptRoot "watch-lab-tunnel.ps1"
$Ps = (Get-Command powershell.exe).Source

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed scheduled task: $TaskName" -ForegroundColor Green
  exit 0
}

$action = New-ScheduledTaskAction -Execute $Ps -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`" -Quiet"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Nexa lab tunnel health check every 5 minutes" -Force | Out-Null

Write-Host "OK  Scheduled task '$TaskName' runs every 5 minutes." -ForegroundColor Green
Write-Host "    Log: $(Join-Path $PSScriptRoot 'lab-watchdog.log')" -ForegroundColor Gray
Write-Host "    Remove: .\register-lab-watchdog.ps1 -Unregister" -ForegroundColor Gray

# Run once now
& $ScriptPath -Quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "    Initial check: all OK" -ForegroundColor Green
} else {
  Write-Host "    Initial check: repaired or still failing (see log)" -ForegroundColor Yellow
}
