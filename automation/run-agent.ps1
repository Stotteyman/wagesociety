<#
    WAGE Society (wagesociety.com) -- unattended Claude Code build agent
    -------------------------------------------------------------------
    Runs headless `claude -p` in the repo, working one item from
    automation\AUTOMATION_BACKLOG.md per run.

    Registered as the Windows Scheduled Task "WAGE Society Auto Build" (hourly).

    BRANCH-ONLY POLICY: the agent may only ever commit and push to a branch
    named auto/*. It must never commit to, push to, or move main or whatever
    branch you had checked out. This script records the baseline branch + SHA
    before the run and shouts in the log if either moved.

    Manual use:
        powershell -ExecutionPolicy Bypass -File "<this file>"        # normal run
        powershell -ExecutionPolicy Bypass -File "<this file>" -Now   # ignore the human-activity guard
        powershell -ExecutionPolicy Bypass -File "<this file>" -WhatIfOnly   # dry run, launches nothing

    Pause the automation WITHOUT unregistering the task:
        - empty the ## Queue section of AUTOMATION_BACKLOG.md, or
        - create the file automation\PAUSED  (any content)
#>
[CmdletBinding()]
param(
    [switch]$Now,
    [switch]$WhatIfOnly
)

$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------------ CONFIG --
$Repo           = 'F:\Work\Websites and Apps\wagesociety2.0'
$HumanGuardMins = 15     # skip the run if a tracked file was edited this recently. 0 = disable
$MaxRunMinutes  = 50     # hard kill, so hourly runs can never overlap
$LogRetainDays  = 30
# ---------------------------------------------------------------------------

$AutoDir  = Join-Path $Repo 'automation'
$LogDir   = Join-Path $AutoDir 'logs'
$LockFile = Join-Path $AutoDir 'run.lock'
$Paused   = Join-Path $AutoDir 'PAUSED'
$Prompt   = Join-Path $AutoDir 'PROMPT.md'
$Backlog  = Join-Path $AutoDir 'AUTOMATION_BACKLOG.md'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$stamp   = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$LogFile = Join-Path $LogDir "run_$stamp.log"

function Log {
    param([string]$Msg, [string]$Level = 'INFO')
    $line = "[{0}] {1,-5} {2}" -f (Get-Date -Format 'HH:mm:ss'), $Level, $Msg
    Write-Host $line
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Stop-Run {
    param([string]$Reason, [int]$Code = 0)
    Log $Reason 'SKIP'
    if (Test-Path -LiteralPath $LockFile) { Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue }
    exit $Code
}

Log "=== WAGE Society auto build run: $stamp ==="

# -- sanity ------------------------------------------------------------------
foreach ($p in @($Repo, $Prompt, $Backlog)) {
    if (-not (Test-Path -LiteralPath $p)) { Log "Missing required path: $p" 'ERROR'; exit 1 }
}

if (Test-Path -LiteralPath $Paused) { Stop-Run "PAUSED marker present ($Paused). Delete it to resume." }

# -- locate claude.exe (VS Code extension ships a native binary) --------------
$claude = $null
$extRoot = Join-Path $env:USERPROFILE '.vscode\extensions'
if (Test-Path -LiteralPath $extRoot) {
    $claude = Get-ChildItem -LiteralPath $extRoot -Directory -Filter 'anthropic.claude-code-*' -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending |
              ForEach-Object { Join-Path $_.FullName 'resources\native-binary\claude.exe' } |
              Where-Object { Test-Path -LiteralPath $_ } |
              Select-Object -First 1
}
if (-not $claude) {
    $cmd = Get-Command claude -ErrorAction SilentlyContinue
    if ($cmd) { $claude = $cmd.Source }
}
if (-not $claude) { Log 'Could not find claude.exe (VS Code extension or PATH).' 'ERROR'; exit 1 }
Log "claude: $claude"

# -- single-instance lock ----------------------------------------------------
if (Test-Path -LiteralPath $LockFile) {
    $lock = Get-Item -LiteralPath $LockFile
    $lockPid  = (Get-Content -LiteralPath $LockFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $alive = $false
    if ($lockPid -match '^\d+$') { $alive = [bool](Get-Process -Id ([int]$lockPid) -ErrorAction SilentlyContinue) }
    if ($alive -and $lock.LastWriteTime -gt (Get-Date).AddMinutes(-($MaxRunMinutes + 10))) {
        Stop-Run "Previous run (PID $lockPid) is still going. Skipping this hour."
    }
    Log "Clearing stale lock (PID $lockPid)." 'WARN'
    Remove-Item -LiteralPath $LockFile -Force
}

# -- baseline branch + SHA, so we can prove the agent didn't move your work ---
$BaseBranch = (& git -C $Repo rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
$BaseSha    = (& git -C $Repo rev-parse HEAD 2>$null | Out-String).Trim()
if (-not $BaseBranch -or -not $BaseSha) { Log 'Not a git repo, or git is unavailable.' 'ERROR'; exit 1 }
if ($BaseBranch -like 'auto/*') {
    Stop-Run "You are sitting on $BaseBranch (an agent branch). Check out your working branch first; refusing to run."
}
Log "Baseline: $BaseBranch @ $($BaseSha.Substring(0,7))"

# -- don't collide with a human mid-edit -------------------------------------
if (-not $Now -and $HumanGuardMins -gt 0) {
    $cutoff = (Get-Date).AddMinutes(-$HumanGuardMins)
    $busy = $null
    foreach ($line in (& git -C $Repo status --porcelain 2>$null)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $rel = $line.Substring(3).Trim().Trim('"')
        if ($rel -like 'automation/*') { continue }
        $full = Join-Path $Repo ($rel -replace '/', '\')
        if ((Test-Path -LiteralPath $full) -and (Get-Item -LiteralPath $full).LastWriteTime -gt $cutoff) {
            $busy = $rel; break
        }
    }
    if ($busy) {
        Stop-Run "Human active -- '$busy' changed in the last $HumanGuardMins min. Not touching the tree."
    }
}

# -- is there anything queued? -----------------------------------------------
$backlogText = Get-Content -LiteralPath $Backlog -Raw
$queue = ''
if ($backlogText -match '(?ms)^##\s+Queue\s*$(.*?)^##\s') { $queue = $Matches[1] }
$openItems = ([regex]::Matches($queue, '(?m)^\s*-\s*\[\s*\]')).Count
$blocked   = ([regex]::Matches($queue, '\[blocked\]')).Count
if ($openItems -eq 0 -or $openItems -le $blocked) {
    Stop-Run "Queue is empty or fully blocked ($openItems open / $blocked blocked). Nothing to do."
}
Log "Queue: $openItems open item(s), $blocked blocked."

if ($WhatIfOnly) { Stop-Run 'Dry run -- all preflight checks passed, launching nothing.' }

# -- go ----------------------------------------------------------------------
Set-Content -LiteralPath $LockFile -Value $PID -Encoding ASCII

$outFile = Join-Path $LogDir "run_${stamp}.out"
$errFile = Join-Path $LogDir "run_${stamp}.err"
$task    = 'Read automation/PROMPT.md and follow it exactly for this run.'
$argList = "-p `"$task`" --dangerously-skip-permissions --output-format text"

Log "Launching agent (hard limit ${MaxRunMinutes}m)..."
$sw = [Diagnostics.Stopwatch]::StartNew()
$exit = -1
try {
    $proc = Start-Process -FilePath $claude -ArgumentList $argList `
                          -WorkingDirectory $Repo -NoNewWindow -PassThru `
                          -RedirectStandardOutput $outFile -RedirectStandardError $errFile

    if (-not $proc.WaitForExit($MaxRunMinutes * 60 * 1000)) {
        Log "Hard limit hit at ${MaxRunMinutes}m -- killing the agent." 'WARN'
        try { $proc.Kill() } catch {}
        Start-Sleep -Seconds 3
    }
    $exit = $proc.ExitCode
}
catch {
    Log "Launch failed: $($_.Exception.Message)" 'ERROR'
}
finally {
    Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue
}
$sw.Stop()

foreach ($f in @($outFile, $errFile)) {
    if (Test-Path -LiteralPath $f) {
        $body = Get-Content -LiteralPath $f -Raw
        if ($body) {
            Add-Content -LiteralPath $LogFile -Value "`n--- $(Split-Path $f -Leaf) ---`n$body" -Encoding UTF8
        }
        Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
    }
}

Log ("Agent exited {0} after {1:n1} min." -f $exit, $sw.Elapsed.TotalMinutes)

# -- branch-only invariant check ---------------------------------------------
Log "--- git state after run ---"
$nowBranch = (& git -C $Repo rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
$nowSha    = (& git -C $Repo rev-parse HEAD 2>$null | Out-String).Trim()
if ($nowBranch -ne $BaseBranch) {
    Log "POLICY VIOLATION: left checked out on '$nowBranch', expected '$BaseBranch'." 'ERROR'
} elseif ($nowSha -ne $BaseSha) {
    Log "POLICY VIOLATION: '$BaseBranch' moved $($BaseSha.Substring(0,7)) -> $($nowSha.Substring(0,7)). The agent committed to your branch." 'ERROR'
} else {
    Log "Baseline intact: still on $BaseBranch @ $($BaseSha.Substring(0,7))."
}

$autoBranches = (& git -C $Repo for-each-ref --sort=-committerdate --format='%(refname:short)  %(committerdate:short)  %(subject)' refs/heads/auto 2>$null | Select-Object -First 5 | Out-String).Trim()
if ($autoBranches) { Log "Local auto/* branches:`n$autoBranches" }
$dirty = (& git -C $Repo status --porcelain | Out-String).Trim()
Log ("working tree: " + $(if ($dirty) { "DIRTY`n$dirty" } else { 'clean' }))

# any auto/* branch that exists locally but was never pushed
$unpushedBranches = @()
foreach ($b in (& git -C $Repo for-each-ref --format='%(refname:short)' refs/heads/auto 2>$null)) {
    $b = "$b".Trim()
    if (-not $b) { continue }
    $tracked = (& git -C $Repo rev-parse --verify --quiet "refs/remotes/origin/$b" 2>$null | Out-String).Trim()
    if (-not $tracked) { $unpushedBranches += $b }
}
if ($unpushedBranches.Count) { Log ("UNPUSHED auto branches: " + ($unpushedBranches -join ', ')) 'WARN' }

# -- log rotation ------------------------------------------------------------
Get-ChildItem -LiteralPath $LogDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$LogRetainDays) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

Log '=== done ==='
exit $exit
