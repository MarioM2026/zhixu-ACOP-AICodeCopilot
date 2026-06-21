@echo off
chcp 437 >nul
cd /d "%~dp0"
title ZhiXu ACOP - Starting

echo.
echo ================================================
echo   ZhiXu ACOP - Startup Script
echo ================================================
echo.

:: ========== 1. Check Environment ==========
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18+
    echo   Download: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%A in ('node -v') do set "NODE_VERSION=%%A"
echo [ENV] Node.js %NODE_VERSION% Ready

:: ========== 2. Check Dependencies ==========
if not exist "node_modules" (
    echo [INSTALL] First run, installing dependencies...
    echo   This may take 2-5 minutes...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Dependency installation failed
        echo.
        pause
        exit /b 1
    )
    echo.
) else (
    echo [ENV] Dependencies Ready
)

echo.
echo ================================================
echo [START] Starting services, please wait...
echo.

:: ========== 3. Start Backend ==========
echo   [1/2] Starting Backend Service (port 3001)...
start "ZhiXu-ACOP-Backend" /min cmd /c "npm run dev:server"
timeout /t 3 /nobreak >nul

:: ========== 4. Start Frontend ==========
echo   [2/2] Starting Frontend Service (port 3000)...
start "ZhiXu-ACOP-Frontend" /min cmd /c "npm run dev:client"
timeout /t 6 /nobreak >nul

:: ========== 5. Open Browser ==========
echo.
echo [READY] Services started successfully!
echo.
echo   Frontend: http://localhost:3000
echo   Dashboard: http://localhost:3000/dashboard
echo   Backend API: http://localhost:3001
echo.
echo   Notes:
echo     - Services run in minimized background windows
echo     - Closing this window won't stop the services
echo     - To stop, close windows with title "ZhiXu-ACOP-"
echo.

powershell -NoProfile -WindowStyle Hidden -Command "Start-Process 'http://localhost:3000'"
echo   Browser opened.
echo.
echo ================================================
pause
