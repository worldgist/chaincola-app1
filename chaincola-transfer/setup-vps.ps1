# ============================================================================
# ChainCola Transfer - One-shot Windows -> VPS deployer
# ----------------------------------------------------------------------------
# Run from any PowerShell (does NOT require Cursor's terminal):
#
#   cd C:\Users\Netpa\myapp\chaincola-app1
#   powershell -ExecutionPolicy Bypass -File chaincola-transfer\setup-vps.ps1
#
# What it does:
#   1. Packages chaincola-transfer (without node_modules / .env) into a tarball
#   2. Uploads it via scp to root@72.61.136.143 (you type the SSH password)
#   3. Extracts it on the VPS into /root/chaincola-transfer (preserves .env)
#   4. If /root/chaincola-transfer/.env is missing or has placeholders, prompts
#      you for the real Flutterwave / Supabase secrets and writes them
#   5. Runs deploy.sh on the VPS (installs Node 20, PM2, nginx, ufw, certbot,
#      starts the app, configures the reverse proxy, gets SSL if DNS is ready)
# ============================================================================

[CmdletBinding()]
param(
    [string]$VpsHost = "72.61.136.143",
    [string]$VpsUser = "root",
    [string]$AppDir  = "/root/chaincola-transfer",
    [switch]$NoSSL,
    [switch]$ReloadOnly,
    [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok  ($msg) { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# Ensure ssh.exe and scp.exe are available (Windows 10+ has them via OpenSSH)
foreach ($bin in @('ssh', 'scp', 'tar')) {
    if (-not (Get-Command $bin -ErrorAction SilentlyContinue)) {
        throw "$bin.exe not found in PATH. Install OpenSSH client (Settings -> Apps -> Optional Features) and ensure tar.exe is available (Windows 10 1803+ ships with it)."
    }
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }
$LocalProj = Join-Path $ProjectRoot 'chaincola-transfer'
if (-not (Test-Path $LocalProj)) {
    # Fallback: maybe script is run from inside chaincola-transfer
    $LocalProj = $PSScriptRoot
}
$Target = "$VpsUser@$VpsHost"

Write-Step "Target: $Target -> $AppDir"
Write-Ok   "Local project: $LocalProj"

# --- 1. Package + upload ----------------------------------------------------
if (-not $SkipUpload -and -not $ReloadOnly) {
    Write-Step "Packaging chaincola-transfer (excluding node_modules and .env)"
    $tgz = Join-Path $env:TEMP "chaincola-transfer.tgz"
    if (Test-Path $tgz) { Remove-Item $tgz -Force }

    Push-Location (Split-Path -Parent $LocalProj)
    try {
        & tar.exe `
            --exclude='chaincola-transfer/node_modules' `
            --exclude='chaincola-transfer/.env' `
            --exclude='chaincola-transfer/.git' `
            -czf "$tgz" 'chaincola-transfer'
        if ($LASTEXITCODE -ne 0) { throw "tar failed with exit $LASTEXITCODE" }
    } finally { Pop-Location }
    Write-Ok "Created $tgz ($([Math]::Round((Get-Item $tgz).Length/1KB,1)) KB)"

    Write-Step "Uploading tarball to $Target (you'll be prompted for the SSH password)"
    & scp.exe -o StrictHostKeyChecking=accept-new "$tgz" "${Target}:/tmp/chaincola-transfer.tgz"
    if ($LASTEXITCODE -ne 0) { throw "scp upload failed" }
    Write-Ok "Upload complete"

    Write-Step "Extracting on VPS (preserves existing .env if any)"
    $extractCmd = @"
set -e
cd /root
if [ -d chaincola-transfer ]; then
  cp -a chaincola-transfer/.env /tmp/_env_keep 2>/dev/null || true
  rm -rf chaincola-transfer.bak
  mv chaincola-transfer chaincola-transfer.bak
fi
tar -xzf /tmp/chaincola-transfer.tgz
rm -f /tmp/chaincola-transfer.tgz
if [ -f /tmp/_env_keep ]; then
  cp /tmp/_env_keep chaincola-transfer/.env
  chmod 600 chaincola-transfer/.env
  rm -f /tmp/_env_keep
fi
ls -la chaincola-transfer | head -n 30
"@
    $extractCmd | & ssh.exe -o StrictHostKeyChecking=accept-new $Target "bash -s"
    if ($LASTEXITCODE -ne 0) { throw "remote extraction failed" }
    Remove-Item $tgz -Force -ErrorAction SilentlyContinue
}

# --- 2. .env handling -------------------------------------------------------
if (-not $ReloadOnly) {
    Write-Step "Checking remote .env"
    $checkCmd = "test -s $AppDir/.env && grep -E '^(FLUTTERWAVE_SECRET_KEY|FLUTTERWAVE_PUBLIC_KEY|FLUTTERWAVE_SECRET_HASH|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' $AppDir/.env | grep -vE '=(\.\.\.|your_|\s*$)' | wc -l"
    $envOkCount = (& ssh.exe -o StrictHostKeyChecking=accept-new $Target $checkCmd) -as [int]

    if ($envOkCount -lt 5) {
        Write-Warn ".env on the VPS is missing or has placeholders ($envOkCount/5 real values)."
        Write-Host  "    Enter the secrets now (they will be written to $AppDir/.env, chmod 600)" -ForegroundColor Yellow

        $fwSecret  = Read-Host "FLUTTERWAVE_SECRET_KEY (FLWSECK-...)"
        $fwPublic  = Read-Host "FLUTTERWAVE_PUBLIC_KEY (FLWPUBK-...)"
        $fwHash    = Read-Host "FLUTTERWAVE_SECRET_HASH"
        $fwApi     = Read-Host "FLUTTERWAVE_API_BASE [https://api.flutterwave.com/v3]"
        if ([string]::IsNullOrWhiteSpace($fwApi)) { $fwApi = "https://api.flutterwave.com/v3" }
        $fwCb      = Read-Host "FLUTTERWAVE_TRANSFER_CALLBACK_URL [https://api.chaincola.com/api/transfer/callback]"
        if ([string]::IsNullOrWhiteSpace($fwCb)) { $fwCb = "https://api.chaincola.com/api/transfer/callback" }
        $sbUrl     = Read-Host "SUPABASE_URL [https://woyvzsysasgvpigaflul.supabase.co]"
        if ([string]::IsNullOrWhiteSpace($sbUrl)) { $sbUrl = "https://woyvzsysasgvpigaflul.supabase.co" }
        $sbKey     = Read-Host "SUPABASE_SERVICE_ROLE_KEY"

        $envBody = @"
PORT=3000
NODE_ENV=production

FLUTTERWAVE_SECRET_KEY=$fwSecret
FLUTTERWAVE_PUBLIC_KEY=$fwPublic
FLUTTERWAVE_API_BASE=$fwApi
FLUTTERWAVE_SECRET_HASH=$fwHash
FLUTTERWAVE_TRANSFER_CALLBACK_URL=$fwCb

SUPABASE_URL=$sbUrl
SUPABASE_SERVICE_ROLE_KEY=$sbKey
"@

        $tmpEnv = Join-Path $env:TEMP "chaincola-transfer.env"
        Set-Content -Path $tmpEnv -Value $envBody -NoNewline -Encoding utf8

        & scp.exe -o StrictHostKeyChecking=accept-new $tmpEnv "${Target}:$AppDir/.env"
        Remove-Item $tmpEnv -Force
        & ssh.exe -o StrictHostKeyChecking=accept-new $Target "chmod 600 $AppDir/.env"
        Write-Ok ".env written"
    } else {
        Write-Ok ".env already populated ($envOkCount/5 required keys present) - leaving it untouched"
    }
}

# --- 3. Run deploy.sh -------------------------------------------------------
Write-Step "Running deploy.sh on VPS"
$flag = ''
if ($ReloadOnly) { $flag = '--reload' }
elseif ($NoSSL)  { $flag = '--no-ssl' }

$remoteCmd = "cd $AppDir && chmod +x deploy.sh && bash deploy.sh $flag"
& ssh.exe -o StrictHostKeyChecking=accept-new -t $Target $remoteCmd
$rc = $LASTEXITCODE

Write-Host ""
if ($rc -eq 0) {
    Write-Step "DONE"
    Write-Ok "Service should be live."
    Write-Ok "Try:  curl -i https://api.chaincola.com/health"
    Write-Ok "Or:   curl -i -H 'Host: api.chaincola.com' http://$VpsHost/health"
} else {
    Write-Warn "deploy.sh exited with code $rc - check the output above."
    exit $rc
}
