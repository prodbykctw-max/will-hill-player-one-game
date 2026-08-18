# Windows entry point for tools/deploy_backend.sh.
#
#   PS> .\tools\deploy_backend.ps1
#   PS> .\tools\deploy_backend.ps1 -Check
#
# ⚠️ THIS IS A LOCATOR, NOT A SECOND IMPLEMENTATION, AND THAT IS THE WHOLE
# DESIGN. The bash script decides one thing: whether the live database really
# has the column before either worker is allowed to deploy. Get that wrong and
# the failure is not a build error — it is his dashboard blank mid-contest, or
# worse, runs quietly losing their stats rows while scores keep saving.
#
# That logic was exercised through all six of its paths against a stub
# wrangler. A PowerShell rewrite would be a SECOND copy of the rule, unrun,
# and the first thing to drift would be the refusal path — the one part that
# only matters on the day it fires. This repo already names that risk about
# the two tally implementations. So Windows runs the same tested script; all
# this file does is find a bash to run it with, and say so plainly if it
# cannot.
#
# He is on PowerShell and this was written as bash only. That was the miss
# this file fixes.
#
# Written unrun - there is no PowerShell in the container it was authored in -
# and then run on his machine, where it found bash, ran the script, and passed
# its refusal back correctly. Kept small anyway: find a bash, forward two
# switches, pass the exit code back. The fallback, if it ever misbehaves:
#
#     & "C:\Program Files\Git\bin\bash.exe" tools/deploy_backend.sh

# ⚠️ POWERSHELL SWITCHES, TRANSLATED. He would type -Check, because that is
# what every other command in this shell takes; the bash script wants --check.
# Forwarding PowerShell's own $args raw sends "-Check", which that script
# rejects as an unknown option -- so it is translated here rather than left as
# a trap in the one file whose whole job is not being a trap.
param(
    [switch]$Check,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'

$passthru = @()
if ($Check) { $passthru += '--check' }
if ($Yes)   { $passthru += '--yes' }

$repoRoot = Split-Path -Parent $PSScriptRoot
$script   = Join-Path $repoRoot 'tools/deploy_backend.sh'

if (-not (Test-Path $script)) {
    Write-Error "Cannot find $script - run this from inside the repo."
    exit 1
}

# Git for Windows ships bash, so anyone who cloned this repo almost certainly
# has one. Ask git where it lives before guessing at paths.
$candidates = @()
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    $gitDir = Split-Path -Parent $gitCmd.Source          # ...\Git\cmd or ...\Git\bin
    $candidates += (Join-Path (Split-Path -Parent $gitDir) 'bin\bash.exe')
    $candidates += (Join-Path $gitDir 'bash.exe')
}
$candidates += 'C:\Program Files\Git\bin\bash.exe'
$candidates += 'C:\Program Files (x86)\Git\bin\bash.exe'
$candidates += "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"

$bash = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $bash) {
    $onPath = Get-Command bash -ErrorAction SilentlyContinue
    if ($onPath) { $bash = $onPath.Source }
}

if (-not $bash) {
    Write-Host ""
    Write-Host "No bash found, so this cannot run the deploy script." -ForegroundColor Red
    Write-Host ""
    Write-Host "Git for Windows bundles one. If git works in this shell it is"
    Write-Host "usually already there - look for:"
    Write-Host "    C:\Program Files\Git\bin\bash.exe"
    Write-Host ""
    Write-Host "Otherwise install Git for Windows, or run the two commands by"
    Write-Host "hand IN THIS ORDER - the order is the entire point:"
    Write-Host ""
    Write-Host "    wrangler d1 execute will-hill-contest --remote --file=cloudflare/migrations/001-max-combo.sql"
    Write-Host "    wrangler d1 execute will-hill-contest --remote --command ""SELECT name FROM pragma_table_info('run_stats')"""
    Write-Host "      ^ max_combo MUST appear in that output before going on"
    Write-Host "    wrangler deploy -c cloudflare/wrangler.dashboard.toml"
    Write-Host "    wrangler deploy -c cloudflare/wrangler.toml"
    Write-Host ""
    exit 1
}

# ⚠️ WRANGLER CAN EXIST IN POWERSHELL AND BE INVISIBLE TO BASH, AND THAT LOOKS
# EXACTLY LIKE NOT HAVING IT. npm installs global commands into %APPDATA%\npm,
# which PowerShell has on PATH and Git Bash frequently does not - so the script
# stops with "wrangler is not installed" on a machine where 'wrangler --version'
# answers fine two lines earlier. That is a maddening thing to debug at 2am, so
# if PowerShell can see wrangler, its directory is put where bash will see it
# too. If PowerShell cannot see it either, it genuinely is not installed and
# the script's own message is correct.
$wr = Get-Command wrangler -ErrorAction SilentlyContinue
if ($wr) {
    $wrDir = Split-Path -Parent $wr.Source
    if ($env:PATH -notlike "*$wrDir*") { $env:PATH = "$wrDir;$env:PATH" }
}

# The repo root is the working directory the script expects.
Push-Location $repoRoot
try {
    & $bash 'tools/deploy_backend.sh' @passthru
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}

# ⚠️ PASS THE EXIT CODE THROUGH. The script's job is to REFUSE - if a refusal
# came back as success here, the one guarantee it offers would be gone.
exit $code
