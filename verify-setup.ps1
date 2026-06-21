# 知墟 ACOP - 脚本功能验证（PowerShell 版）
# 模拟启动.bat / 安装依赖.bat / 停止.bat 的关键逻辑
# 注意：这不是完整启动，只是验证环境检测和文件结构

$ErrorActionPreference = "Continue"

Write-Host "=== 知墟 ACOP - 方案 B 脚本功能验证 ===" -ForegroundColor Cyan
Write-Host ""

$project = "D:\AI-Workspace\ZhiXu-ACOP"
Set-Location $project

# === 1. 检测 Node.js ===
Write-Host "[步骤 1/6] 检测运行环境..." -ForegroundColor Yellow
try {
    $nodeVer = (node --version 2>$null).Trim()
    Write-Host "   [OK] Node.js $nodeVer"
} catch {
    Write-Host "   [错误] 未检测到 Node.js" -ForegroundColor Red
}

try {
    $npmVer = (npm --version 2>$null).Trim()
    Write-Host "   [OK] npm $npmVer"
} catch {
    Write-Host "   [错误] 未检测到 npm" -ForegroundColor Red
}

# === 2. 检查 package.json ===
Write-Host ""
Write-Host "[步骤 2/6] 检查项目配置文件..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    $pkg = Get-Content "package.json" | ConvertFrom-Json
    Write-Host "   [OK] package.json 存在，项目: $($pkg.name) v$($pkg.version)"
} else {
    Write-Host "   [错误] 未找到 package.json" -ForegroundColor Red
}

# === 3. 检查依赖是否安装 ===
Write-Host ""
Write-Host "[步骤 3/6] 检查依赖安装状态..." -ForegroundColor Yellow
if (Test-Path "node_modules\express") {
    Write-Host "   [OK] express 已安装"
} else {
    Write-Host "   [提示] express 未安装，需要先运行 安装依赖.bat" -ForegroundColor Magenta
}

if (Test-Path "node_modules\react") {
    Write-Host "   [OK] react 已安装"
} else {
    Write-Host "   [提示] react 未安装" -ForegroundColor Magenta
}

if (Test-Path "node_modules\vite\bin\vite.js") {
    Write-Host "   [OK] vite 已安装"
} else {
    Write-Host "   [提示] vite 未安装" -ForegroundColor Magenta
}

# === 4. 检查源码文件 ===
Write-Host ""
Write-Host "[步骤 4/6] 检查项目源码完整性..." -ForegroundColor Yellow
$checkFiles = @(
    "src\server\index.ts",
    "src\server\services\adapterService.ts",
    "src\client\src\App.tsx",
    "src\client\src\pages\Dashboard.tsx"
)
foreach ($f in $checkFiles) {
    if (Test-Path $f) {
        Write-Host "   [OK] $f"
    } else {
        Write-Host "   [警告] 缺失: $f" -ForegroundColor Magenta
    }
}

# === 5. 端口检测 ===
Write-Host ""
Write-Host "[步骤 5/6] 检查端口占用..." -ForegroundColor Yellow
$ports = @(3000, 3001)
foreach ($p in $ports) {
    $used = netstat -ano 2>$null | Select-String ":$p.*LISTENING"
    if ($used) {
        Write-Host "   [提示] 端口 $p 已被占用（可能服务正在运行）" -ForegroundColor Magenta
    } else {
        Write-Host "   [OK] 端口 $p 可用"
    }
}

# === 6. 验证脚本文件 ===
Write-Host ""
Write-Host "[步骤 6/6] 验证方案 B 的 4 个文件..." -ForegroundColor Yellow
$batFiles = @("启动.bat", "安装依赖.bat", "停止.bat", "README.txt")
foreach ($name in $batFiles) {
    if (Test-Path $name) {
        $size = (Get-Item $name).Length
        Write-Host "   [OK] $name  ($([math]::Round($size/1024,1)) KB)"
    } else {
        Write-Host "   [错误] 缺失: $name" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== 验证完成 ===" -ForegroundColor Green
Write-Host ""
Write-Host "📌 下一步:"
Write-Host "   1. 如果依赖已安装 → 双击 [启动.bat] 启动平台"
Write-Host "   2. 如果依赖未安装 → 先双击 [安装依赖.bat]"
Write-Host "   3. 停止服务 → 双击 [停止.bat]"
Write-Host ""
Write-Host "   前端地址: http://localhost:3000"
Write-Host "   后端地址: http://localhost:3001"
Write-Host ""
