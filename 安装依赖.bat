@echo off
chcp 65001 >nul
title 知墟 ACOP - 依赖安装器

REM ============================================================
REM  知墟 ACOP 依赖安装器 v1.0.0
REM  用途：
REM    1. 检测 Node.js / npm 是否存在
REM    2. 清理旧的 node_modules（可选）
REM    3. 执行 npm install 安装项目依赖
REM    4. 验证安装是否成功
REM ============================================================

setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ============================================================
echo   知墟 ACOP - 依赖安装器 v1.0.0
echo ============================================================
echo.
echo [步骤 1/4] 检测运行环境...

where node >nul 2>&1
if errorlevel 1 (
    echo   [错误] 未检测到 Node.js
    echo          请访问 https://nodejs.org 下载并安装 Node.js 18.0 或更高版本
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VER=%%i
echo   [OK] Node.js %NODE_VER%

where npm >nul 2>&1
if errorlevel 1 (
    echo   [错误] 未检测到 npm
    echo          请重新安装 Node.js
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version 2^>nul') do set NPM_VER=%%i
echo   [OK] npm %NPM_VER%

echo.
echo [步骤 2/4] 检查是否需要清理旧依赖...

if exist "node_modules" (
    echo   检测到已存在的 node_modules 目录
    echo   是否清理后重新安装? (y/n)
    set /p CLEAN=
    if /i "!CLEAN!"=="y" (
        echo   正在清理 node_modules...
        rmdir /s /q "node_modules" 2>nul
        if exist "package-lock.json" (
            echo   是否删除 package-lock.json 以确保全新安装? (y/n)
            set /p CLEAN_LOCK=
            if /i "!CLEAN_LOCK!"=="y" (
                del /q "package-lock.json" 2>nul
                echo   [OK] 已删除 package-lock.json
            )
        )
        echo   [OK] 清理完成
    ) else (
        echo   保留现有依赖，仅安装缺失包
    )
) else (
    echo   node_modules 目录不存在，将全新安装
)

echo.
echo [步骤 3/4] 安装依赖...
echo.
echo   正在执行: npm install
echo   注意：首次安装可能需要 3-10 分钟，取决于网络速度
echo         如果安装卡住，请尝试:
echo           1. 切换 npm 镜像: npm config set registry https://registry.npmmirror.com
echo           2. 断开公司网络 / 代理
echo           3. 查看 npm 日志: npm config get cache 目录下的 _logs
echo.
echo ============================================================
echo.

npm install
set INSTALL_RESULT=%ERRORLEVEL%

echo.
echo ============================================================
echo [步骤 4/4] 验证安装结果...
echo.

if %INSTALL_RESULT% NEQ 0 (
    echo   [错误] 依赖安装失败，退出码: %INSTALL_RESULT%
    echo.
    echo   常见问题：
    echo   1. 网络问题 - 请尝试切换镜像源
    echo      命令: npm config set registry https://registry.npmmirror.com
    echo   2. 权限问题 - 请使用管理员权限运行本脚本
    echo   3. 缓存损坏 - 尝试清理缓存:
    echo      npm cache clean --force
    echo      然后删除 node_modules 和 package-lock.json
    echo      再重新运行本脚本
    echo.
    pause
    exit /b 1
)

REM 验证关键依赖是否存在
if exist "node_modules\express" (
    echo   [OK] express 已安装
) else (
    echo   [警告] express 未正确安装
)

if exist "node_modules\react" (
    echo   [OK] react 已安装
) else (
    echo   [警告] react 未正确安装
)

if exist "node_modules\vite" (
    echo   [OK] vite 已安装
) else (
    echo   [警告] vite 未正确安装
)

if exist "node_modules\.bin\tsx.cmd" (
    echo   [OK] tsx (TS 运行时) 已安装
) else (
    echo   [警告] tsx 未正确安装
)

echo.
echo ============================================================
echo   ✅ 依赖安装完成！
echo ============================================================
echo.
echo   下一步：
echo     1. 双击 [启动.bat] 启动知墟 ACOP 平台
echo     2. 浏览器会自动打开 http://localhost:3000
echo.
echo   如果之前已配置好钉钉告警，相关配置会被自动加载
echo.
echo   如需详细说明，请查看同目录下的 README.txt
echo.
pause
endlocal
