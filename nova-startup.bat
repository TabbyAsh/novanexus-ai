@echo off
title NovaNexus AI - Backend Services
echo.
echo ========================================
echo   NovaNexus AI - Starting Services
echo ========================================
echo.

cd /d C:\Users\kibbl\nova-enterprises

:: Start Docker containers
echo [1/4] Starting databases...
docker-compose up -d postgres redis
timeout /t 5 /nobreak > nul

:: Start backend services via PowerShell jobs
echo [2/4] Starting backend services...
start /min powershell -WindowStyle Hidden -Command "Set-Location 'C:\Users\kibbl\nova-enterprises'; npm run dev --workspace=@nova/auth-service"
timeout /t 3 /nobreak > nul
start /min powershell -WindowStyle Hidden -Command "Set-Location 'C:\Users\kibbl\nova-enterprises'; npm run dev --workspace=@nova/gateway-service"
timeout /t 3 /nobreak > nul
start /min powershell -WindowStyle Hidden -Command "Set-Location 'C:\Users\kibbl\nova-enterprises'; npm run dev --workspace=@nova/tradebot"
timeout /t 5 /nobreak > nul

:: Start Cloudflare tunnel
echo [3/4] Starting Cloudflare tunnel...
start /min "Cloudflare Tunnel" "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run novanexus-api

echo [4/4] All services started!
echo.
echo ========================================
echo   NovaNexus AI is now running!
echo ========================================
echo.
echo   Frontend: https://novanexus-ai.com
echo   API:      https://api.novanexus-ai.com
echo.
echo   Press any key to close this window...
echo   (Services will continue running)
echo.
pause > nul
