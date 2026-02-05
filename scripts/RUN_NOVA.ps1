<#
.SYNOPSIS
    Run Nova Hub - Governed Automation Platform
.DESCRIPTION
    Starts Nova Hub API and Web UI in either nodocker (SQLite) or docker (PostgreSQL) mode.
.PARAMETER Mode
    Execution mode: 'nodocker' (default) or 'docker'
#>
param(
    [ValidateSet('nodocker', 'docker', 'auto')]
    [string]$Mode = 'auto'
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$DataDir = Join-Path $RootDir "data"
$LogDir = Join-Path $DataDir "logs"

# Colors for output
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# Banner
Write-Host @"
╔═══════════════════════════════════════════════════════════════╗
║                    NOVA HUB                                    ║
║              Governed Automation Platform                      ║
╚═══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta

# Detect mode if auto
if ($Mode -eq 'auto') {
    if ($env:NOVA_MODE) {
        $Mode = $env:NOVA_MODE
        Write-Info "Mode from environment: $Mode"
    } else {
        try {
            $dockerInfo = docker info 2>$null
            if ($LASTEXITCODE -eq 0) {
                $Mode = 'docker'
                Write-Info "Docker detected, using docker mode"
            } else {
                $Mode = 'nodocker'
            }
        } catch {
            $Mode = 'nodocker'
        }
        Write-Info "Auto-detected mode: $Mode"
    }
}

Write-Info "Starting Nova Hub in $Mode mode..."

# Create directories
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "backups") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "exports") | Out-Null

# Check Python
Write-Info "Checking Python..."
try {
    $pythonVersion = python --version 2>&1
    if ($pythonVersion -match "Python 3\.(1[1-9]|[2-9]\d)") {
        Write-Success "Python: $pythonVersion"
    } else {
        Write-Err "Python 3.11+ required. Found: $pythonVersion"
        exit 1
    }
} catch {
    Write-Err "Python not found. Please install Python 3.11+"
    exit 1
}

# Check Node.js
Write-Info "Checking Node.js..."
try {
    $nodeVersion = node --version 2>&1
    Write-Success "Node.js: $nodeVersion"
} catch {
    Write-Warn "Node.js not found. Web UI may not start."
}

# Check ports
Write-Info "Checking ports..."
$apiPort = 8000
$webPort = 5173

$apiInUse = Get-NetTCPConnection -LocalPort $apiPort -ErrorAction SilentlyContinue
if ($apiInUse) {
    Write-Err "Port $apiPort is in use. Please stop the existing process."
    Write-Err "Run: Get-Process -Id (Get-NetTCPConnection -LocalPort $apiPort).OwningProcess | Stop-Process"
    exit 1
}

$webInUse = Get-NetTCPConnection -LocalPort $webPort -ErrorAction SilentlyContinue
if ($webInUse) {
    Write-Warn "Port $webPort is in use. Web UI may not start."
}

# Setup environment
$env:NOVA_MODE = $Mode
$env:PYTHONPATH = "$RootDir\services\api;$RootDir\services\core;$RootDir\services\bots;$env:PYTHONPATH"

if ($Mode -eq 'nodocker') {
    $env:DATABASE_URL = "sqlite+aiosqlite:///$DataDir/nova.db"
    Write-Info "Database: SQLite at $DataDir/nova.db"
} else {
    # Start Docker containers
    Write-Info "Starting Docker containers..."
    Push-Location $RootDir
    docker-compose up -d postgres redis 2>&1 | Out-Null
    Pop-Location
    
    Start-Sleep -Seconds 3
    $env:DATABASE_URL = "postgresql+asyncpg://nova:nova_dev_password@localhost:5432/nova"
    Write-Info "Database: PostgreSQL via Docker"
}

# Install Python dependencies
Write-Info "Installing Python dependencies..."
Push-Location (Join-Path $RootDir "services\api")
pip install -e ".[dev]" -q 2>&1 | Out-Null
Pop-Location

Push-Location (Join-Path $RootDir "services\core")
pip install -e . -q 2>&1 | Out-Null
Pop-Location

Push-Location (Join-Path $RootDir "services\bots")
pip install -e . -q 2>&1 | Out-Null
Pop-Location

Write-Success "Dependencies installed"

# Start API server
Write-Info "Starting API server on port $apiPort..."
$apiLogFile = Join-Path $LogDir "api.log"
$apiProcess = Start-Process -FilePath "python" -ArgumentList "-m", "uvicorn", "nova_api.main:app", "--host", "0.0.0.0", "--port", "$apiPort" -WorkingDirectory (Join-Path $RootDir "services\api") -PassThru -RedirectStandardOutput $apiLogFile -RedirectStandardError (Join-Path $LogDir "api_error.log") -WindowStyle Hidden

# Wait for API to be ready
Write-Info "Waiting for API to be ready..."
$maxWait = 30
$waited = 0
while ($waited -lt $maxWait) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$apiPort/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Success "API is ready!"
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
    $waited++
}

if ($waited -ge $maxWait) {
    Write-Err "API failed to start. Check $apiLogFile"
    Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue
    exit 1
}

# Start bot worker
Write-Info "Starting bot worker..."
$workerLogFile = Join-Path $LogDir "worker.log"
$workerProcess = Start-Process -FilePath "python" -ArgumentList "-m", "nova_bots.worker" -WorkingDirectory (Join-Path $RootDir "services\bots") -PassThru -RedirectStandardOutput $workerLogFile -RedirectStandardError (Join-Path $LogDir "worker_error.log") -WindowStyle Hidden

# Print info
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Success "Nova Hub is running!"
Write-Host ""
Write-Host "  API:      http://localhost:$apiPort" -ForegroundColor White
Write-Host "  API Docs: http://localhost:$apiPort/docs" -ForegroundColor White
Write-Host ""
Write-Host "  Demo Credentials:" -ForegroundColor Yellow
Write-Host "    Admin:    admin / admin123" -ForegroundColor White
Write-Host "    Operator: operator / operator123" -ForegroundColor White
Write-Host "    Viewer:   viewer / viewer123" -ForegroundColor White
Write-Host ""
Write-Host "  Logs: $LogDir" -ForegroundColor Gray
Write-Host "  Data: $DataDir" -ForegroundColor Gray
Write-Host ""
Write-Host "  Press Ctrl+C to stop..." -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green

# Wait for Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 1
        # Check if API is still running
        if ($apiProcess.HasExited) {
            Write-Err "API process exited unexpectedly"
            break
        }
    }
} finally {
    Write-Info "Shutting down..."
    Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue
    Stop-Process -Id $workerProcess.Id -ErrorAction SilentlyContinue
    
    if ($Mode -eq 'docker') {
        Write-Info "Stopping Docker containers..."
        Push-Location $RootDir
        docker-compose stop 2>&1 | Out-Null
        Pop-Location
    }
    
    Write-Success "Nova Hub stopped."
}
