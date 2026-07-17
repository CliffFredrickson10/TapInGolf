# TapIn Golf - Local Dev Script (Windows PowerShell)
# Sets up SSH tunnel, builds API server and starts all dev servers
# Usage: powershell -ExecutionPolicy Bypass -File dev.ps1

$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$API_DIR = Join-Path $ROOT "artifacts\api-server"
$PORTAL_DIR = Join-Path $ROOT "artifacts\club-portal"

Write-Host "`n=== TapIn Golf Dev Server ===" -ForegroundColor Green

# --- SSH Tunnel ---
Write-Host "`n[1/5] Setting up SSH tunnel to database..." -ForegroundColor Cyan

# Kill any existing tunnel on port 1111
$existing = Get-NetTCPConnection -LocalPort 1111 -ErrorAction SilentlyContinue
if ($existing) {
    $existing | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

# Start SSH tunnel in background
# Requires OpenSSH (built into Windows 10/11) — password will be prompted
Write-Host "Connecting to tapingolf.dedicated.co.za..." -ForegroundColor Yellow
Write-Host "Enter server password when prompted: NC4Rv#Jx%4Aj" -ForegroundColor Yellow
$tunnel = Start-Process ssh -ArgumentList "-f -N -L 1111:localhost:5432 root@tapingolf.dedicated.co.za -o StrictHostKeyChecking=no" -PassThru -NoNewWindow
Start-Sleep -Seconds 3

$tunnelCheck = Get-NetTCPConnection -LocalPort 1111 -ErrorAction SilentlyContinue
if ($tunnelCheck) {
    Write-Host "SSH tunnel established on port 1111" -ForegroundColor Green
} else {
    Write-Host "WARNING: SSH tunnel may not be connected. Continuing anyway..." -ForegroundColor Yellow
}

# Set environment variables
$env:DATABASE_URL = "postgresql://tapingolf:Pretoria2026@localhost:1111/tapingolf"
$env:PORT = "3000"
$env:PAYFAST_SANDBOX = "1"

# --- Kill existing servers ---
Write-Host "`n[2/5] Stopping existing servers..." -ForegroundColor Cyan

# Kill processes on port 3000
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port3000) {
    $port3000 | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# Kill processes on port 5174
$port5174 = Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue
if ($port5174) {
    $port5174 | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Seconds 1

# --- Build API ---
Write-Host "`n[3/5] Building API server..." -ForegroundColor Cyan
Set-Location $API_DIR
node build.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "API build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "API built successfully" -ForegroundColor Green

# --- Start API ---
Write-Host "`n[4/5] Starting API server on port 3000..." -ForegroundColor Cyan
$apiProcess = Start-Process node -ArgumentList "--enable-source-maps ./dist/index.mjs" -PassThru -NoNewWindow -WorkingDirectory $API_DIR
Start-Sleep -Seconds 3

try {
    $health = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
    Write-Host "API server running (PID: $($apiProcess.Id))" -ForegroundColor Green
} catch {
    Write-Host "API server may still be starting..." -ForegroundColor Yellow
}

# --- Start Club Portal ---
Write-Host "`n[5/5] Starting club portal on port 5174..." -ForegroundColor Cyan
$env:VITE_API_TARGET = "http://localhost:3000"
Set-Location $PORTAL_DIR
$portalProcess = Start-Process npx -ArgumentList "vite --port 5174" -PassThru -NoNewWindow -WorkingDirectory $PORTAL_DIR
Start-Sleep -Seconds 3
Write-Host "Club portal running (PID: $($portalProcess.Id))" -ForegroundColor Green

# --- Summary ---
Write-Host "`n=== All servers running ===" -ForegroundColor Green
Write-Host "  SSH Tunnel:  localhost:1111 -> DB"
Write-Host "  API:         http://localhost:3000/api"
Write-Host "  Club Portal: http://localhost:5174"
Write-Host ""
Write-Host "For mobile app, run separately:"
Write-Host "  cd $ROOT\artifacts\tapin-golf"
Write-Host "  npx expo start --ios --clear"
Write-Host ""
Write-Host "Press Ctrl+C to stop all servers" -ForegroundColor Yellow
Write-Host "==============================`n"

# Wait and cleanup on exit
try {
    while ($true) {
        Start-Sleep -Seconds 1
        if ($apiProcess.HasExited -or $portalProcess.HasExited) {
            Write-Host "A server process has exited. Shutting down..." -ForegroundColor Yellow
            break
        }
    }
} finally {
    Write-Host "`nStopping servers..." -ForegroundColor Cyan
    if (!$apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue }
    if (!$portalProcess.HasExited) { Stop-Process -Id $portalProcess.Id -Force -ErrorAction SilentlyContinue }
    if ($tunnel -and !$tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "All servers stopped." -ForegroundColor Green
}
