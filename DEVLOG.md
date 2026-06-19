# 知墟 · 开发日志

> 项目代号：ZhiXu-ACOP（AI Code Assistant Observation Platform）
> 最后更新：**2026-06-19**

---

## 2026-06-19 · 第 3 天（今日）

### ✅ 今日完成

| # | 模块 | 内容 | 状态 |
|---|---|---|---|
| 3-1 | Trae 适配器 | 修复 `listLogFiles` 递归扫描子目录，支持深层嵌套日志路径（`logs/<时间戳>/Modular/ai-agent_*.log`） | ✅ |
| 3-2 | Trae 适配器 | 新增 `parseTraeLog` 专用解析器，从 Rust Tracing 日志按 `session_id` 聚合并提取模型/时长/token 估算 | ✅ |
| 3-3 | Trae 适配器 | 增量扫描逻辑：记录上次文件大小（`processedFileMap`），只读取新增长度，避免重复解析 | ✅ |
| 3-4 | Trae 适配器 | 状态持久化：`processedFileMap` + `metrics` 落盘到 `%APPDATA%/zhixu-acop-state/trae-adapter-state.json` | ✅ |
| 3-5 | 前端 API | 修复 `ContextManagement.tsx` 所有 API 调用路径缺失 `/api` 前缀（`/context/sessions` → `/api/context/sessions` 等 5 处） | ✅ |
| 3-6 | 前端 UI | **上下文管理页面 UI 风格重构**：从原生 Tailwind 改为全站统一的科技风 CSS 框架（`page` / `card-panel` / `panel-title` / `badge` / `tab-bar` 等） | ✅ |
| 3-7 | 前端 UI | 全局 CSS 补充：`tab-bar/tab-btn`、`progress-bar-container/fill`、`grid-2col`、`detail-stats/grid/actions`、`input/select` 统一表单样式 | ✅ |
| 3-8 | 页面验证 | 使用本地 Chrome + Playwright 自动化验证 `/events` 与 `/context` 页面正常渲染、无 JS 语法错误、表格/卡片/Tab 齐全 | ✅ |

### 🐛 问题追溯与修复路径

**问题 A · "输入目录后显示事件为 0"**
- 根因 1：`listLogFiles` 只扫描顶层目录，未进入 `logs/<时间戳>/Modular/` 子目录
- 根因 2：通用解析器 `parseGenericContent` 不识别 Rust Tracing 字段格式（`session_id=... duration=...ms`）
- 修复：递归扫描深度 ≥4 层 + `parseTraeLog` 专用解析器（按 `session_id` 聚合，正则匹配 `total_duration/duration`，估算 tokens）

**问题 B · "上下文管理页面空白"**
- 根因 1：前端 `api.get('/context/sessions')` 路径缺少 `/api` 前缀 → Vite 代理不转发 → 404
- 根因 2：页面使用原生 Tailwind，与 `Events.tsx` / `Dashboard.tsx` 采用的自定义 CSS 框架风格不一致
- 修复：所有 API 调用补 `/api` 前缀 + 按科技风框架重写页面结构

### 📊 当前状态

- 后端服务：`http://localhost:3001` ✅
- 前端开发服务器：`http://localhost:3000` ✅
- Trae 适配器：启用中，扫描路径 `C:/Users/11971/AppData/Roaming/TRAE SOLO CN/logs` ✅
- 事件总量：1200+，会话数 50+ ✅
- 上下文管理页面：正常显示会话画像 / 重要度评分 / 风险标签 / 建议操作 ✅

---

## 2026-06-18 · 第 2 天（回顾）

| # | 模块 | 内容 | 状态 |
|---|---|---|---|
| 2-1 | 后端路由 | `/api/adapters`、`/api/events`、`/api/context/sessions`、`/api/dashboard` 接口对齐 | ✅ |
| 2-2 | 前端页面 | `Dashboard` / `Events` / `Rules` / `ModelRouting` / `Settings` 页基础结构完成 | ✅ |
| 2-3 | 适配器 | Trae / Cursor / Claude Code 三类适配器框架（`adapterService` 统一管理） | ✅ |
| 2-4 | 数据存储 | `storageService` 事件持久化 + 内存索引 | ✅ |
| 2-5 | 规则引擎 | `ruleService` 基础规则匹配能力 | ✅ |

---

## 2026-06-17 · 第 1 天（项目启动）

| # | 模块 | 内容 | 状态 |
|---|---|---|---|
| 1-1 | 项目脚手架 | TypeScript + Node.js + Express + React + Vite + Vitest | ✅ |
| 1-2 | 目录结构 | `src/client` / `src/server` / `src/shared` / `packages/adapter-*` 分层 | ✅ |
| 1-3 | 共享类型 | `src/shared/types/*` 定义 `AICodeEvent` / `Adapter` / `Rule` 核心类型 | ✅ |
| 1-4 | CI/CD | GitHub Actions `ci.yml` + issue/pr 模板 | ✅ |

---

## 后续开发阶段规划

### 🔵 阶段 1 · 基础功能闭环（1~2 天）
**目标：确保每一个页面都能正确请求 API 并渲染，不出现空白/404**

- [ ] **模型路由页面** `ModelRouting.tsx`：
  - 检查 `api.ts` 中是否存在 `/api/model-routing` 相关接口
  - 与后端 `src/server/services/modelProfileService.ts` 对齐
  - UI 风格统一到科技风框架
- [ ] **规则管理页面** `Rules.tsx`：
  - 检查 `/api/rules` API 调用路径正确性
  - 规则列表渲染 + 新增/删除/切换规则状态
  - 规则详情编辑（条件字段 + 动作字段）
- [ ] **仪表板页面** `Dashboard.tsx`：
  - 检查 `/api/dashboard` 返回数据与前端图表绑定
  - 确保指标卡（事件数/活跃会话/token 总量）不为空
  - 可能需要补充 `dashboardService.ts` 的聚合逻辑
- [ ] **设置页面** `Settings.tsx`：
  - Trae 日志路径的表单输入 + 保存按钮调用 `POST /api/adapters/trae/config`
  - 保存后立即触发一次扫描（避免用户重启）
  - 扫描状态反馈（扫描中/扫描完成/路径无效）

### 🟢 阶段 2 · 上下文管理功能增强（2~3 天）
**目标：从"能显示列表"进化到"能辅助决策清理"**

- [ ] **重要度评分算法完善**（`contextManagerService.ts`）：
  - 时效性：按最后活跃时间衰减（越近越重要）
  - Token 使用量：高 token 会话优先保留（避免重建长上下文）
  - 质量：代码接受率、错误率加权
  - 任务复杂度：`taskClassifier.ts` 多分类任务数
  - 四因子权重可在前端调整并实时预览
- [ ] **清理建议可信度**：
  - `建议新建`：高 token 但低代码接受率 + 近期上下文溢出
  - `建议归档`：长时间不活跃 + 高重要度（后续可能复用）
  - `建议清理`：长时间不活跃 + 低重要度（一次性任务）
  - 在数据库中持久化决策记录
- [ ] **会话详情增强**：
  - 显示最近 N 条事件（代码片段 / 模型调用 / 耗时分布）
  - 会话时间线图表（token 增长曲线 vs 事件发生位置）
  - 一键"标记为重要"、"忽略此会话"操作
- [ ] **增量扫描稳定性**：
  - 文件被删除/移动/重命名的容错处理
  - `processedFileMap` 定期清理（避免无限增长）
  - 异常日志行（非 JSON/非 Tracing 格式）不中断解析

### 🟡 阶段 3 · 模型路由与规则引擎（2 天）
**目标：从"能看数据"进化到"能控制 AI 行为"**

- [ ] **模型路由规则引擎**（`routerService.ts`）：
  - 按任务类型（代码编写/调试/重构/文档）路由到不同模型
  - 按 token 预算自动降级（超出阈值从 qwen-plus 切到 qwen-max）
  - 规则热加载（无需重启服务）
- [ ] **规则管理 CRUD**：
  - 规则模板（例如"调试场景用 qwen-plus"）
  - 规则优先级排序
  - 规则测试沙箱（输入一个模拟事件，显示命中情况）
- [ ] **告警服务**（`alertService.ts`）：
  - 连续高错误率 → 前端 Toast 提醒
  - 异常高 token 消耗 → 触发上下文清理建议

### 🟠 阶段 4 · 多适配器扩展（2~3 天）
**目标：Trae 之外，支持 Cursor / Claude Code**

- [ ] **Cursor 适配器**（`cursorAdapter.ts`）：
  - 定位 Cursor 的日志路径（Windows: `%APPDATA%/Cursor/...`）
  - 日志格式解析（Cursor 使用不同的字段格式）
  - 配置页面让用户输入自定义日志路径
- [ ] **Claude Code 适配器**（`claudeCodeAdapter.ts`）：
  - `packages/adapter-claude-code/` 包补全
  - CLI 调用日志 vs 桌面版日志
- [ ] **适配器统一管理**：
  - 多适配器并发扫描（各自独立状态）
  - 全局事件数/token 数聚合
  - 适配器健康状态指示（路径有效/最近扫描时间）

### 🔴 阶段 5 · 测试、部署、性能优化（2~3 天）
**目标：从"能跑"进化到"可发布"**

- [ ] **单元测试补全**：
  - `parseTraeLog` 边界 case（空文件、异常 session_id、超大 duration）
  - `contextManagerService` 的评分算法断言
  - `adapterUtils` 的递归扫描、增量扫描逻辑
- [ ] **E2E 测试**（已存在 `workflow.e2e.test.ts`）：
  - 启动服务 → 设置 Trae 路径 → 等待扫描 → 验证 `/events` / `/context/sessions` 返回数据
- [ ] **性能优化**：
  - 事件存储持久化到 SQLite（当前可能在内存中）
  - 查询分页避免前端渲染阻塞
  - 日志扫描节流（新文件快速响应，旧文件定期扫描）
- [ ] **Docker 部署**（已有 `Dockerfile` / `docker-compose.yml`）：
  - 多阶段构建验证
  - 日志路径 volume 挂载说明
  - 首次启动引导（检查 Trae 路径、引导用户填入）

---

## 优先级总览（P0 > P1 > P2）

| P0（阻断性，必须先修） | P1（核心功能，本周内） | P2（增强，下周起） |
|---|---|---|
| 阶段 1 全量页面验证 | 阶段 2 · 评分算法完善 | 阶段 4 · 多适配器 |
| 设置页面路径保存 | 阶段 2 · 会话详情增强 | 阶段 5 · 性能优化 |
| 上下文 API 数据完整 | 阶段 3 · 模型路由规则 | 阶段 5 · 部署文档 |

> **下一优先级**：先完成**阶段 1**（所有页面能正常请求与渲染），这是最容易验证的功能闭环。确认无误后进入**阶段 2** 的上下文管理增强。
