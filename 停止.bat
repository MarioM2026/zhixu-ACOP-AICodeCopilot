@echo off
chcp 65001 >nul
title 知墟 ACOP - 停止服务

REM ============================================================
REM  知墟 ACOP 停止服务脚本 v1.0.0
REM  用途：
REM    1. 查找占用端口 3000 (前端) 和 3001 (后端) 的进程
REM    2. 停止这些 Node.js 进程
REM    3. 给出停止后的状态报告
REM ============================================================

setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ============================================================
echo   知墟 ACOP - 停止服务 v1.0.0
echo ============================================================
echo.
echo [步骤 1/3] 查找占用端口的进程...
echo.

set FOUND=0
set PID_LIST=

REM === 查找 3001 端口 ===
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001.*LISTENING"') do (
    set PID=%%a
    REM 去掉可能的引号和空格
    set PID=!PID:"=!
    if not "!PID!"=="" (
        echo   发现后端服务进程: PID=!PID! (端口 3001)
        set PID_LIST=!PID_LIST! !PID!
        set /a FOUND=FOUND+1
    )
)

REM === 查找 3000 端口 ===
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000.*LISTENING"') do (
    set PID=%%a
    set PID=!PID:"=!
    if not "!PID!"=="" (
        echo   发现前端服务进程: PID=!PID! (端口 3000)
        set PID_LIST=!PID_LIST! !PID!
        set /a FOUND=FOUND+1
    )
)

REM === 也直接查找包含 "zhixu" / "tsx" / "vite" 的 Node 进程 ===
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo csv 2^>nul ^| findstr /i "node.exe"') do (
    set NPID=%%a
    set NPID=!NPID:"=!
    if not "!NPID!"=="" (
        REM 检查是否已在列表中
        echo !PID_LIST! | findstr /c:"!NPID!" >nul
        if errorlevel 1 (
            echo   发现相关 Node 进程: PID=!NPID!
            set PID_LIST=!PID_LIST! !NPID!
            set /a FOUND=FOUND+1
        )
    )
)

if %FOUND%==0 (
    echo   [OK] 未发现运行中的知墟 ACOP 服务
    echo.
    echo   如果服务之前是正常的，可能已在其他窗口被停止
    pause
    exit /b 0
)

echo.
echo [步骤 2/3] 停止 %FOUND% 个进程...
echo.

for %%p in (%PID_LIST%) do (
    if not "%%p"=="" (
        echo   正在停止 PID=%%p ...
        taskkill /F /PID %%p >nul 2>&1
        if !errorlevel!==0 (
            echo     [OK] 已停止 PID=%%p
        ) else (
            echo     [警告] 无法停止 PID=%%p（可能需要管理员权限）
        )
    )
)

echo.
echo [步骤 3/3] 验证停止结果...
echo.

timeout /t 2 /nobreak >nul

set REMAIN=0
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":300[01].*LISTENING"') do (
    set /a REMAIN=REMAIN+1
)

if %REMAIN%==0 (
    echo   [OK] 所有端口已释放，服务已停止
) else (
    echo   [警告] 还有 %REMAIN% 个端口未释放，请稍后重试或手动结束进程
)

echo.
echo ============================================================
echo   知墟 ACOP 服务已停止
echo   如需重新启动，请双击 [启动.bat]
echo ============================================================
echo.
pause
endlocal
