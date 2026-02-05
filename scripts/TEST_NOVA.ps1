<#
.SYNOPSIS
    Test Nova Hub - Run all acceptance tests
.DESCRIPTION
    Runs backend tests, integration tests, and UI smoke tests
#>
param(
    [switch]$SkipUI,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$TestDir = Join-Path $RootDir "tests"

# Colors
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[PASS] $args" -ForegroundColor Green }
function Write-Fail { Write-Host "[FAIL] $args" -ForegroundColor Red }

Write-Host @"
╔═══════════════════════════════════════════════════════════════╗
║                 NOVA HUB TEST SUITE                            ║
╚═══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta

$failedTests = @()
$passedTests = @()

# Setup environment
$env:NOVA_MODE = "nodocker"
$env:PYTHONPATH = "$RootDir\services\api;$RootDir\services\core;$RootDir\services\bots"
$env:DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Install dependencies
Write-Info "Installing test dependencies..."
Push-Location (Join-Path $RootDir "services\api")
pip install -e ".[dev]" -q 2>&1 | Out-Null
Pop-Location
Push-Location (Join-Path $RootDir "services\core")
pip install -e ".[dev]" -q 2>&1 | Out-Null
Pop-Location
Push-Location (Join-Path $RootDir "services\bots")
pip install -e ".[dev]" -q 2>&1 | Out-Null
Pop-Location

# Run pytest
Write-Info "Running acceptance tests..."
$pytestArgs = @("-v", "--tb=short")
if (-not $Verbose) { $pytestArgs = @("--tb=short") }

Push-Location $TestDir
$testResult = python -m pytest $pytestArgs 2>&1
$exitCode = $LASTEXITCODE
Pop-Location

if ($exitCode -eq 0) {
    Write-Success "All tests passed!"
} else {
    Write-Fail "Some tests failed. Exit code: $exitCode"
    Write-Host $testResult
}

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

if ($exitCode -eq 0) {
    Write-Success "All acceptance tests passed"
    exit 0
} else {
    Write-Fail "Tests failed"
    exit 1
}
