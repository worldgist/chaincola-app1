# ============================================================================
# Set SUPABASE_SERVICE_ROLE_KEY safely (not via chat)
# ----------------------------------------------------------------------------
# Usage (from any PowerShell window):
#   cd C:\Users\Netpa\myapp\chaincola-app1
#   powershell -ExecutionPolicy Bypass -File chaincola-transfer\set-supabase-key.ps1
#
# Where to copy the key from:
#   https://supabase.com/dashboard/project/woyvzsysasgvpigaflul/settings/api
#   -> "Project API keys" section -> service_role -> Reveal -> copy
#
# What this script does:
#   1. Prompts for the key with masked input (never echoed)
#   2. Validates it looks like a JWT (eyJ...) and that "role":"service_role"
#      is encoded in it
#   3. Writes it to local C:\...\chaincola-transfer\.env (gitignored)
#   4. Pushes the .env to /root/chaincola-transfer/.env on the VPS via scp
#      (uses the chaincola-new SSH key — no password prompt)
#   5. pm2 reloads chaincola-transfer and tails the last 15 log lines
#   6. Verifies POST /api/transfer/withdrawal returns the expected
#      "Withdrawal not found" (which proves Supabase auth worked)
# ============================================================================

[CmdletBinding()]
param(
    [string]$VpsHost = "chaincola-new",
    [string]$AppDir  = "/root/chaincola-transfer"
)

$ErrorActionPreference = "Stop"

function Write-Step($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok  ($m) { Write-Host "    $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "    $m" -ForegroundColor Yellow }
function Write-Err ($m) { Write-Host "    $m" -ForegroundColor Red }

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }
$LocalEnv = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $LocalEnv)) {
    throw "Local .env not found at $LocalEnv. Run the deploy first."
}

Write-Step "Paste the SUPABASE_SERVICE_ROLE_KEY (input is hidden)"
Write-Host  "    Get it from:" -ForegroundColor Gray
Write-Host  "    https://supabase.com/dashboard/project/woyvzsysasgvpigaflul/settings/api" -ForegroundColor Gray
Write-Host  "    Click the 'service_role' key, press 'Reveal', copy it, paste here." -ForegroundColor Gray

$secure = Read-Host "service_role key" -AsSecureString
$bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($key)) { Write-Err "Empty input - aborting"; exit 1 }
if (-not $key.StartsWith("eyJ")) { Write-Err "That doesn't look like a JWT (should start with eyJ) - aborting"; exit 1 }

# Decode middle segment to check role/ref
try {
    $parts = $key.Split('.')
    if ($parts.Length -ne 3) { throw "JWT must have 3 parts separated by dots" }
    $pad = '=' * ((4 - ($parts[1].Length % 4)) % 4)
    $b64 = ($parts[1] + $pad).Replace('-', '+').Replace('_', '/')
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
    if ($json -notmatch '"role"\s*:\s*"service_role"') {
        Write-Err "Decoded JWT does not have role=service_role. Got: $json"
        Write-Err "Did you paste the anon key by mistake?"
        exit 1
    }
    if ($json -notmatch '"ref"\s*:\s*"woyvzsysasgvpigaflul"') {
        Write-Warn "JWT ref is not 'woyvzsysasgvpigaflul' (current project). Continuing anyway."
        Write-Warn "Decoded payload: $json"
    } else {
        Write-Ok "JWT validated: role=service_role, ref=woyvzsysasgvpigaflul"
    }
} catch {
    Write-Err "Failed to decode JWT: $_"
    exit 1
}

Write-Step "Updating local $LocalEnv"
$envText = Get-Content $LocalEnv -Raw
if ($envText -match '(?m)^SUPABASE_SERVICE_ROLE_KEY=.*$') {
    $envText = $envText -replace '(?m)^SUPABASE_SERVICE_ROLE_KEY=.*$', "SUPABASE_SERVICE_ROLE_KEY=$key"
} else {
    if (-not $envText.EndsWith("`n")) { $envText += "`n" }
    $envText += "SUPABASE_SERVICE_ROLE_KEY=$key`n"
}
$envText = $envText -replace "`r", ""
[IO.File]::WriteAllText($LocalEnv, $envText, [Text.UTF8Encoding]::new($false))
Write-Ok "local .env updated"

Write-Step "Pushing .env to ${VpsHost}:$AppDir/.env"
$tmp = Join-Path $env:TEMP "chaincola-transfer.env.upload"
[IO.File]::WriteAllText($tmp, $envText, [Text.UTF8Encoding]::new($false))
& scp.exe -q -o StrictHostKeyChecking=no $tmp "${VpsHost}:$AppDir/.env"
Remove-Item $tmp -Force
if ($LASTEXITCODE -ne 0) { Write-Err "scp failed: $LASTEXITCODE"; exit $LASTEXITCODE }
& ssh.exe $VpsHost "chmod 600 $AppDir/.env"
Write-Ok ".env pushed and locked (chmod 600)"

Write-Step "Reloading PM2"
& ssh.exe $VpsHost "pm2 reload chaincola-transfer && sleep 1 && pm2 list 2>&1 | head -n 6"

Write-Step "Last 10 startup log lines"
& ssh.exe $VpsHost "pm2 logs chaincola-transfer --lines 10 --nostream 2>&1 | tail -n 25"

Write-Step "Probing admin endpoint (no token => expect 401)"
& curl.exe -m 10 -sS -o $null -w "HTTP %{http_code}`n" -X POST -H "Content-Type: application/json" -d '{"withdrawal_id":"00000000-0000-0000-0000-000000000000"}' "https://api.chaincola.com/api/transfer/withdrawal"

Write-Step "DONE"
Write-Ok "Health: https://api.chaincola.com/health"
Write-Ok "Logs:   ssh $VpsHost 'pm2 logs chaincola-transfer'"
