# 知墟 ACOP · 安装向导 PRD

> 产品需求文档 · Installation Wizard Product Requirements Document

## 1. 文档信息

| 项 | 内容 |
| --- | --- |
| 产品名称 | 知墟 ACOP（AI Coding Observability Platform） |
| 模块名称 | 安装向导（Installation Wizard） |
| 版本 | v1.0.0 |
| 适用对象 | 开发者 / 最终用户 / 运维人员 |
| 支持平台 | Windows / macOS / Linux |

---

## 2. 背景与目标

### 2.1 背景

知墟 ACOP 是一个面向开发者的 AI 编程助手观测与优化平台，需要在本地部署后端服务与前端 UI。初次使用时，用户往往需要：

- 确认本地环境是否满足要求（Node.js、npm、Git）
- 指定日常使用的 AI 编程软件（Trae、Claude Code、Cursor 等）的日志路径
- 配置服务端口与主题偏好

### 2.2 目标

通过一个 **4 步向导式 UI**，将上述配置过程可视化、自动化，降低用户上手门槛。同时通过后端服务持久化配置，避免重复设置。

---

## 3. 用户角色与使用场景

| 角色 | 典型场景 |
| --- | --- |
| 开发者（首次使用） | 下载源码后运行向导 → 自动检测环境 → 选择 AI 软件 → 完成配置 → 进入仪表盘 |
| 运维人员（重新配置） | 因故更换机器 / 目录 → 重新运行向导 → 验证路径 → 保存新配置 |
| 测试人员 | 模拟各种环境缺失场景，验证错误处理与提示信息 |

---

## 4. 核心流程（4 步）

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. 环境检测 │ ──▶ │ 2. 软件选择 │ ──▶ │ 3. 安装部署 │ ──▶ │ 4. 完成配置 │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 4.1 步骤 1：环境检测

- **检测项**：Node.js（≥ 18.0.0，必需）、npm（≥ 8.0.0，必需）、Git（可选）
- **展示信息**：版本号、可执行路径、最低版本要求、下载链接（如缺失）
- **操作系统信息**：平台、版本、总内存
- **校验规则**：必需项未安装 → 禁用「下一步」按钮并给出提示

### 4.2 步骤 2：AI 软件选择

- **自动扫描**：检测 Trae / Claude Code / Cursor 的默认日志目录
- **手动指定**：未检测到时允许用户手动输入路径，支持后端校验（路径存在 + 是目录 + 有日志文件）
- **多选**：用户可勾选多个要接入的软件，也可全部不选
- **卡片交互**：点击卡片切换选中状态；已检测到的卡片有绿色边框

### 4.3 步骤 3：安装部署

- **核心动作**：写入配置文件 → 检查依赖 → 确认服务运行 → 健康检查 → 完成
- **进度展示**：0-100% 进度条 + 实时日志面板（最多保留最近 500 行）
- **状态流转**：`idle → writing_config → installing_deps → starting_server → health_check → running → completed`

### 4.4 步骤 4：完成配置

- 展示后端服务地址、前端地址、配置文件路径
- 列出已选择接入的 AI 软件与路径
- 提供「进入仪表盘」与「前往设置」两个入口

---

## 5. API 接口设计

### 5.1 环境检测

```
GET /api/installer/env
→ { success: true, data: { node, npm, git, os, allRequiredInstalled } }
```

### 5.2 AI 软件检测

```
GET /api/installer/ai-software
→ { success: true, data: { trae, claude_code, cursor } }

POST /api/installer/ai-software/validate
Body: { software: 'trae', path: 'C:/Users/.../logs' }
→ { success: true, exists: true, logFiles: 42, message: '...', path: '...' }
```

### 5.3 安装配置

```
POST /api/installer/config
Body: { port, frontendPort, aiSoftwares, theme, telemetryEnabled }
→ { success: true, configPath: '...', message: '配置已保存' }

GET /api/installer/config
→ { success: true, data: {...} }
```

### 5.4 安装流程与状态

```
POST /api/installer/install
Body: { port, frontendPort, aiSoftwares, theme, telemetryEnabled }
→ { success: true, data: { phase, message, progress, logs, ... } }

GET /api/installer/status
→ { success: true, data: { phase, message, progress, logs, startedAt, completedAt } }

GET /api/installer/complete
→ { success: true, data: { phase, serverUrl, frontendUrl, configPath, aiSoftwares, completedAt } }

POST /api/installer/reset
→ { success: true, data: { phase: 'idle', ... } }
```

---

## 6. 数据结构（后端 TypeScript 类型）

- `EnvInfo`：单项环境信息（name / installed / version / required / minimumVersion / path / downloadUrl）
- `EnvSummary`：完整环境检测结果（node / npm / git / os / allRequiredInstalled）
- `AiSoftwareInfo`：AI 软件信息（type / name / detected / logPath / candidatePaths / enabled / manualPath）
- `InstallPhase`：安装阶段枚举（idle / checking_env / ... / completed / failed）
- `InstallStatus`：安装状态（phase / message / progress / logs / startedAt / completedAt / error）
- `InstallConfig`：用户配置（port / frontendPort / aiSoftwares / theme / telemetryEnabled）
- `InstallCompleteInfo`：完成后系统信息

---

## 7. 配置持久化

- **存储位置**：`%APPDATA%/zhixu-acop/install-config.json`（Windows）
  - macOS / Linux：`$HOME/.zhixu-acop/install-config.json` 的等价处理
- **格式**：JSON，追加 `_savedAt` 与 `_version` 元字段
- **读取策略**：后端启动时尝试读取配置；前端通过 `GET /api/installer/config` 获取

---

## 8. UI 设计风格

- **主题**：科技风深色主题（A 方案）
- **主色调**：青色 `#00f5ff`
- **背景色**：深蓝渐变 `#0a0f1a → #0a1220`
- **玻璃态卡片**：半透明背景 + 模糊 + 青色发光边框
- **字体**：`JetBrains Mono` / `Consolas` 等宽字体
- **步骤指示器**：横向排列，已完成绿色 ✓，当前青色发光，未来灰色编号
- **动画**：pulse（加载中）、bounce（完成页图标）、进度条平滑过渡

---

## 9. 异常与错误处理

| 场景 | 处理方式 |
| --- | --- |
| Node.js / npm 未安装 | 禁用「下一步」，显示下载链接与提示 |
| AI 软件路径不存在 | 后端返回 `exists: false`，前端给出警告 |
| 路径存在但无日志文件 | 给出「初次使用正常」的友好提示 |
| 配置写入失败（权限不足） | 返回 `success: false` + 错误消息，保持当前状态可重试 |
| 健康检查超时 | 进入 failed 状态，保留日志供排查 |
| 网络异常 / API 调用失败 | 前端 Toast 提示 + 保留已加载数据 |

---

## 10. 非功能要求

- **响应时间**：环境检测 & AI 软件检测均需在 2 秒内返回（含命令执行超时保护）
- **健壮性**：所有 `execSync` / `fs.readdirSync` 均包裹 try/catch，确保单个项目异常不阻塞整个检测
- **日志上限**：前端与后端的日志列表均保留最近 500 行，避免内存膨胀
- **可重入**：`POST /api/installer/reset` 可随时重置状态，支持重复演练安装流程

---

## 11. 验收标准

1. 首次进入 `/installer` 页面能看到 4 步向导，并在步骤 1 自动触发环境检测
2. 环境检测失败时「下一步」按钮被禁用，且每个缺失项显示下载链接
3. 步骤 2 中选择的软件会被持久化到配置文件并在步骤 4 展示
4. 步骤 3 进度条会从 0% 走到 100%，并在完成后自动跳到步骤 4
5. 健康检查接口 `GET /api/health` 可独立访问并返回正常结果
6. 完成页点击「进入仪表盘」能成功跳转到 `/dashboard`

---

## 12. 后续迭代方向

- 支持「检测到新版本 → 一键更新」
- 支持导入 / 导出配置（分享给团队成员）
- 支持服务守护进程模式（systemd / Windows Service）
- 增加代理与镜像源配置面板
