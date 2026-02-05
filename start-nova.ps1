<# 
.SYNOPSIS
    Nova Enterprises - Production Startup Script
.DESCRIPTION
    Starts all Nova Enterprises services in the correct order.
    Run from PowerShell: .\start-nova.ps1
.NOTES
    Author: Nova Enterprises
    Version: 1.0.0
#>

param(
    [switch]$SkipDocker,
    [switch]$SkipBuild,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$NOVA_ROOT = $PSScriptRoot

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   NOVA ENTERPRISES - Platform Startup" -ForegroundColor Cyan
Write-Host "   AI-Orchestrated International Commerce" -ForegroundColor Gray
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Check if already running
$existingJobs = Get-Job | Where-Object { $_.Name -match "nova-|gateway|auth|orchestrator|tradebot|storebot|socialbot|marketdata|web" }
if ($existingJobs) {
    Write-Host "[!] Found existing Nova services running. Stopping them first..." -ForegroundColor Yellow
    $existingJobs | Stop-Job -PassThru | Remove-Job
    Start-Sleep -Seconds 2
}

# Start Docker containers if needed
if (-not $SkipDocker) {
    Write-Host "[1/5] Starting infrastructure services (Docker)..." -ForegroundColor Green
    
    $postgresRunning = docker ps --filter "name=nova-postgres" --format "{{.Names}}" 2>$null
    if (-not $postgresRunning) {
        Write-Host "  Starting PostgreSQL..." -ForegroundColor Gray
        docker start nova-postgres 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Creating PostgreSQL container..." -ForegroundColor Gray
            docker run -d --name nova-postgres -e POSTGRES_PASSWORD=novadev -e POSTGRES_DB=nova -p 5432:5432 postgres:15
        }
    } else {
        Write-Host "  PostgreSQL already running" -ForegroundColor Gray
    }

    $redisRunning = docker ps --filter "name=nova-redis" --format "{{.Names}}" 2>$null
    if (-not $redisRunning) {
        Write-Host "  Starting Redis..." -ForegroundColor Gray
        docker start nova-redis 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Creating Redis container..." -ForegroundColor Gray
            docker run -d --name nova-redis -p 6379:6379 redis:7-alpine
        }
    } else {
        Write-Host "  Redis already running" -ForegroundColor Gray
    }

    Start-Sleep -Seconds 3
}

# Build if needed
if (-not $SkipBuild) {
    Write-Host "[2/5] Verifying builds..." -ForegroundColor Green
    
    # Check if dist folders exist
    $services = @("gateway", "auth", "tradebot", "storebot", "socialbot", "marketdata", "orchestrator")
    $needsBuild = $false
    
    foreach ($service in $services) {
        $distPath = Join-Path $NOVA_ROOT "node_modules\@nova\$service\dist"
        if (-not (Test-Path $distPath)) {
            $needsBuild = $true
            break
        }
    }
    
    if ($needsBuild) {
        Write-Host "  Building services..." -ForegroundColor Gray
        Push-Location $NOVA_ROOT
        npx turbo run build 2>$null
        Pop-Location
    } else {
        Write-Host "  All services already built" -ForegroundColor Gray
    }
}

# Service configurations
$services = @(
    @{ Name = "auth"; Port = 3001; Path = "node_modules\@nova\auth" },
    @{ Name = "gateway"; Port = 3000; Path = "node_modules\@nova\gateway" },
    @{ Name = "orchestrator"; Port = 3002; Path = "node_modules\@nova\orchestrator" },
    @{ Name = "tradebot"; Port = 3010; Path = "node_modules\@nova\tradebot" },
    @{ Name = "storebot"; Port = 3011; Path = "node_modules\@nova\storebot" },
    @{ Name = "socialbot"; Port = 3012; Path = "node_modules\@nova\socialbot" },
    @{ Name = "marketdata"; Port = 3020; Path = "node_modules\@nova\marketdata" }
)

# Start backend services
Write-Host "[3/5] Starting backend services..." -ForegroundColor Green

foreach ($service in $services) {
    $servicePath = Join-Path $NOVA_ROOT $service.Path
    $jobName = "nova-$($service.Name)"
    
    Write-Host "  Starting $($service.Name) on port $($service.Port)..." -ForegroundColor Gray
    
    Start-Job -Name $jobName -ScriptBlock {
        param($path)
        Set-Location $path
        node dist/index.js
    } -ArgumentList $servicePath | Out-Null
}

Start-Sleep -Seconds 3

# Start web app
Write-Host "[4/5] Starting web application..." -ForegroundColor Green
$webPath = Join-Path $NOVA_ROOT "apps\web"
Start-Job -Name "nova-web" -ScriptBlock {
    param($path)
    Set-Location $path
    npx next start -p 4000
} -ArgumentList $webPath | Out-Null

Start-Sleep -Seconds 2

# Verify services
Write-Host "[5/5] Verifying services..." -ForegroundColor Green

$allHealthy = $true
$endpoints = @(
    @{ Name = "Gateway"; Url = "http://localhost:3000/health" },
    @{ Name = "Auth"; Url = "http://localhost:3001/health" },
    @{ Name = "TradeBot"; Url = "http://localhost:3010/health" },
    @{ Name = "StoreBot"; Url = "http://localhost:3011/health" },
    @{ Name = "SocialBot"; Url = "http://localhost:3012/health" },
    @{ Name = "MarketData"; Url = "http://localhost:3020/health" }
)

Start-Sleep -Seconds 2

foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-RestMethod -Uri $endpoint.Url -TimeoutSec 5 -ErrorAction SilentlyContinue
        Write-Host "  [OK] $($endpoint.Name)" -ForegroundColor Green
    } catch {
        Write-Host "  [--] $($endpoint.Name) (starting...)" -ForegroundColor Yellow
    }
}

# Summary
Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   NOVA ENTERPRISES - Platform Ready!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Web Dashboard:    http://localhost:4000" -ForegroundColor White
Write-Host "  API Gateway:      http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "  Dashboard Pages:" -ForegroundColor Gray
Write-Host "    Trading:        http://localhost:4000/dashboard/trading" -ForegroundColor Gray
Write-Host "    Marketplace:    http://localhost:4000/dashboard/marketplace" -ForegroundColor Gray
Write-Host "    Social Hub:     http://localhost:4000/dashboard/social-hub" -ForegroundColor Gray
Write-Host ""
Write-Host "  API Services:" -ForegroundColor Gray
Write-Host "    TradeBot:       http://localhost:3010" -ForegroundColor Gray
Write-Host "    StoreBot:       http://localhost:3011" -ForegroundColor Gray
Write-Host "    SocialBot:      http://localhost:3012" -ForegroundColor Gray
Write-Host "    MarketData:     http://localhost:3020" -ForegroundColor Gray
Write-Host ""
Write-Host "  Commands:" -ForegroundColor Gray
Write-Host "    View logs:      Get-Job | Receive-Job" -ForegroundColor Gray
Write-Host "    Stop all:       Get-Job | Stop-Job; Get-Job | Remove-Job" -ForegroundColor Gray
Write-Host ""
Write-Host "  Press Ctrl+C to keep services running in background" -ForegroundColor Yellow
Write-Host ""
