<#
    Registers (or re-registers) the hourly Windows Scheduled Task that runs the
    WAGE Society autonomous build agent.

    Run once:  powershell -ExecutionPolicy Bypass -File automation\register-task.ps1
    Remove:    Unregister-ScheduledTask -TaskName 'WAGE Society Auto Build' -Confirm:$false

    Runs at :17 past the hour, staggered away from "FuriousPvP Auto Build" (:52)
    and "WAGE Learn Auto Build" (:32) so two agents never fight over the CPU.
#>
$ErrorActionPreference = 'Stop'

$TaskName    = 'WAGE Society Auto Build'
$Script      = 'F:\Work\Websites and Apps\wagesociety2.0\automation\run-agent.ps1'
$StartMinute = 17

if (-not (Test-Path -LiteralPath $Script)) { throw "Runner not found: $Script" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $Script) `
    -WorkingDirectory (Split-Path $Script -Parent)

# Next occurrence of :$StartMinute, then hourly forever.
$now   = Get-Date
$start = $now.Date.AddHours($now.Hour).AddMinutes($StartMinute)
if ($start -le $now.AddMinutes(1)) { $start = $start.AddHours(1) }

$trigger = New-ScheduledTaskTrigger -Once -At $start `
    -RepetitionInterval (New-TimeSpan -Hours 1)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -Hidden

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed existing task."
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal `
    -Description 'Runs Claude Code headless in the wagesociety2.0 repo once an hour, working one item from automation\AUTOMATION_BACKLOG.md onto an auto/* branch. Never touches main.' | Out-Null

$t = Get-ScheduledTask -TaskName $TaskName
$i = $t | Get-ScheduledTaskInfo
Write-Host "Registered : $($t.TaskName)"
Write-Host "State      : $($t.State)"
Write-Host "Next run   : $($i.NextRunTime)"
