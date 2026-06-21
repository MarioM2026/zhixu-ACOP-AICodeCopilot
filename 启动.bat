@echo off
chcp 65001 >nul
title 知墟 ACOP - AI 编程助手观测平台 [启动器]

REM ============================================================
REM  知墟 ACOP 启动器 v1.0.0
REM  用途：
REM    1. 检测 Node.js / npm 是否存在
REM    2. 检测依赖是否安装
REM    3. 启动后端服务（端口 3001）和前端服务（端口 3000）
REM    4. 自动打开浏览器访问管理界面
REM ============================================================

setlocal enabledelayedexpansion

REM === 切换到脚本所在目录 ===
cd /d "%~dp0"

echo.
echo ============================================================
echo   知墟 ACOP - AI 编程助手观测与优化平台
echo   启动器 v1.0.0
echo ============================================================
echo.
echo [步骤 1/5] 检测运行环境...

REM === 1. 检测 Node.js ===
where node >nul 2>&1
if errorlevel 1 (
    echo   [错误] 未检测到 Node.js
    echo          请访问 https://nodejs.org 下载并安装 Node.js 18.0 或更高版本
    echo.
    echo          安装完成后重新双击本脚本
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VER=%%i
echo   [OK] Node.js %NODE_VER%

REM === 2. 检测 npm ===
where npm >nul 2>&1
if errorlevel 1 (
    echo   [错误] 未检测到 npm
    echo          请重新安装 Node.js，npm 会随 Node.js 一起安装
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version 2^>nul') do set NPM_VER=%%i
echo   [OK] npm %NPM_VER%

echo.
echo [步骤 2/5] 检查依赖安装状态...

if not exist "node_modules" (
    echo   [提示] 检测到 node_modules 目录不存在
    echo          首次使用需要先安装依赖
    echo.
    echo          请双击运行 [安装依赖.bat]
    echo          或者在当前目录执行: npm install
    echo.
    echo   现在是否自动安装依赖? (y/n)
    set /p AUTO_INSTALL=
    if /i "!AUTO_INSTALL!"=="y" (
        call "安装依赖.bat"
        if errorlevel 1 (
            echo   [错误] 依赖安装失败，请检查网络后重试
            echo.
            pause
            exit /b 1
        )
    ) else (
        echo   [取消] 已取消启动，请先运行 [安装依赖.bat]
        echo.
        pause
        exit /b 0
    )
) else (
    echo   [OK] 依赖已安装
)

echo.
echo [步骤 3/5] 检查端口占用...

REM === 检测 3001 端口 ===
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo   [警告] 端口 3001 已被占用
    echo          可能之前启动的服务仍在运行
    echo          请运行 [停止.bat] 或手动关闭占用进程
    echo.
    echo   是否仍然尝试启动? (y/n)
    set /p CONTINUE=
    if /i not "!CONTINUE!"=="y" (
        echo   [取消] 启动已终止
        echo.
        pause
        exit /b 0
    )
) else (
    echo   [OK] 后端端口 3001 可用
)

REM === 检测 3000 端口 ===
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo   [警告] 端口 3000 已被占用，前端将使用备用端口
) else (
    echo   [OK] 前端端口 3000 可用
)

echo.
echo [步骤 4/5] 启动服务...
echo.
echo   🚀 正在启动后端服务 (端口 3001)...
echo   🚀 正在启动前端服务 (端口 3000)...
echo.
echo ============================================================
echo   服务启动后将自动打开浏览器
echo   前端: http://localhost:3000
echo   后端: http://localhost:3001
echo   日志:   日志目录 logs/
echo ============================================================
echo.
echo   提示: 按 Ctrl+C 可停止所有服务
echo.

REM === 在启动前确保必要目录存在 ===
if not exist "logs" mkdir logs
if not exist "data" mkdir data

REM === 启动前后端服务（使用 start 分别在新窗口启动，便于查看日志） ===
REM   使用 npm run dev 需要依赖 concurrently
REM   但为了简化，我们直接用 start 分别启动两个进程

REM --- 方案: 使用 npm run dev（同时启动前后端，共用一个窗口） ---
npm run dev

REM === 如果 npm run dev 退出，给出提示 ===
echo.
echo ============================================================
echo   服务已停止运行
echo   如需再次启动，请重新双击 [启动.bat]
echo ============================================================
echo.
pause

endlocal
