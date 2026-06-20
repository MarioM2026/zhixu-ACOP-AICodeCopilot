/**
 * 提示注入服务 (Prompt Injection Service)
 *
 * 当规则触发时生成针对性的代码质量/上下文优化提示。
 * 这些提示可以直接复制粘贴到 Trae/Cursor/Claude Code 的对话中，
 * 引导 AI 工具给出更符合项目规范的代码。
 */

import { v4 as uuidv4 } from 'uuid';
import { loadJSON, schedulePersist, saveJSON } from './storageService';
import { logger } from './logger';

const STORAGE_KEY = 'prompt-injections';

/** 提示类型枚举 */
export type PromptType =
  | 'code_quality'        // 代码质量优化提示
  | 'context_cleanup'     // 上下文清理建议
  | 'error_rate_reduction' // 降低错误率提示
  | 'latency_optimization' // 延迟优化提示
  | 'token_management';   // Token 管理提示

/** 提示状态 */
export type PromptStatus = 'generated' | 'reviewed' | 'applied' | 'dismissed';

/** 单条提示注入记录 */
export interface PromptInjection {
  id: string;
  ruleId: string;             // 触发该提示的规则 ID
  ruleName: string;           // 规则名称（便于展示）
  type: PromptType;           // 提示类型
  title: string;              // 标题
  content: string;            // 提示正文（可直接复制的 Prompt）
  summary: string;            // 简短摘要
  status: PromptStatus;       // 当前状态
  generatedAt: number;        // 生成时间
  updatedAt: number;          // 最后更新时间
  appliedAt?: number;         // 应用时间
  triggerContext?: {          // 触发上下文快照
    tokenUsage: number;
    errorRate: number;
    avgLatency: number;
    requestCount: number;
  };
}

// ============ 内存存储 ============
const injections: Map<string, PromptInjection> = new Map();
let isLoaded = false;

// ============ 提示模板库 ============

interface PromptTemplate {
  title: string;
  summary: string;
  build: (ctx: { tokenUsage: number; errorRate: number; avgLatency: number; requestCount: number }) => string;
}

const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  // 上下文溢出/Token 消耗过高 → 注入精简代码提示
  token_threshold: {
    title: '上下文即将溢出，请精简代码输出',
    summary: '当检测到 Token 消耗接近上限时，注入精简代码的提示以降低上下文占用。',
    build: (ctx) =>
      `请在接下来的代码输出中注意：

\`\`\`
📊 当前状态（系统检测）：
  • Token 使用量：约 ${ctx.tokenUsage.toLocaleString()} tokens
  • 对话请求次数：${ctx.requestCount} 次
  • 建议策略：上下文精简 + 缩短输出
\`\`\`

## 响应规范

请严格遵循以下规则，以避免上下文溢出：

**1. 代码输出规则**
- 只输出与当前任务相关的代码块，不要重复完整的上下文文件
- 对已存在的代码，输出 \`diff\` 格式或 \`hunk\` 格式（用 \`...\` 表示省略的无关行）
- 大段重构拆成多个小步骤，每步只输出当前改动

**2. 解释与推理**
- 用 2-3 句话解释改动意图即可，不要长篇大论
- 默认不输出注释；仅当逻辑复杂时在关键位置加一行说明

**3. 语言与风格**
- 保持与当前项目一致的代码风格
- 避免输出样板/脚手架代码（README、占位文件等）

**4. 验证**
- 输出前检查：本次输出的非空白行数是否超过 50 行？如果是，考虑进一步精简

感谢你的协作 —— 这将显著减少会话上下文占用并延长有效对话时间。`,
  },

  // 错误率过高 → 注入防御性编程提示
  error_rate: {
    title: '检测到高错误率，请加强防御性编程',
    summary: '当错误率超过阈值时，注入更严格的输入校验与错误处理提示。',
    build: (ctx) =>
      `请在接下来的代码生成中加强防御性编程：

\`\`\`
📊 当前状态（系统检测）：
  • 近期错误率：约 ${ctx.errorRate.toFixed(1)}%
  • 建议策略：增加输入校验 + 显式错误处理
\`\`\`

## 强制检查清单

**生成任何函数/方法时必须做到：**
1. ✅ 校验所有入参的类型与边界（null / undefined / 空数组 / 空字符串）
2. ✅ 对外部调用（fetch、文件 I/O、数据库访问）使用 try-catch 并记录错误
3. ✅ 异步操作使用 try-catch-finally 或 .catch() 兜底
4. ✅ 返回 Promise 时显式声明拒绝类型（如 Promise<T | Error>）
5. ✅ 避免 \`any\` 类型；必须使用时加注释说明原因

**常见陷阱检查：**
- 数组索引越界：访问 \`arr[i]\` 前是否检查了 \`i < arr.length\`
- 对象属性访问：对可选链使用 \`?.\`，对深层访问提供安全默认值
- 除法运算前检查除数不为 0
- 日期/时间解析检查失败场景

**错误处理模板：**
\`\`\`
try {
  const result = await operation();
  if (!isValid(result)) throw new Error('Invalid result');
  return result;
} catch (err) {
  logger.error('operation failed', { err, inputs });
  throw err; // 或返回有意义的默认值
}
\`\`\`

请在后续输出中内化以上规则。`,
  },

  // 延迟过高 → 注入性能优化提示
  latency_threshold: {
    title: '检测到高延迟响应，请优化性能',
    summary: '当平均延迟超过阈值时，注入性能优化与并发控制提示。',
    build: (ctx) =>
      `请在接下来的代码生成中优先考虑性能：

\`\`\`
📊 当前状态（系统检测）：
  • 平均延迟：约 ${(ctx.avgLatency / 1000).toFixed(1)}s
  • 建议策略：减少同步阻塞 + 使用流式/增量输出
\`\`\`

## 性能优化清单

**1. 减少不必要的重新计算**
- 纯函数结果考虑记忆化（memoization）
- 循环中避免 O(n²) 操作，必要时改为 Map 查找
- 大数组操作前思考：是否真的需要整份拷贝？

**2. 并发控制**
- 多个独立异步调用使用 \`Promise.all\` 并发执行
- 串行依赖使用 \`for...of\` + await，避免阻塞队列
- 对可能失败的并发操作使用 \`Promise.allSettled\`

**3. 输出策略**
- 优先输出当前最关键的代码块，让我可以立即审查/运行
- 其余非关键部分（如样式、配置、注释）延后或跳过
- 大文件修改以 diff/hunk 形式输出

**4. 数据结构选型**
- 频繁查找 → 使用 Map 或 Set（O(1) 查找）
- 有序范围查询 → 考虑二分查找
- 只需要存在性判断 → 使用 Set

请在后续输出中遵循以上原则，若存在明显性能改进空间，主动指出。`,
  },

  // 上下文清理 → 注入重启会话提示
  context_overflow: {
    title: '建议重新开始会话',
    summary: '当上下文严重溢出时，注入重新开始会话的建议以及关键上下文摘要。',
    build: (ctx) =>
      `## 📦 上下文已接近上限

当前 Token 使用量约 **${ctx.tokenUsage.toLocaleString()}**，累计请求 **${ctx.requestCount}** 次。建议：

### 方案 A：保留上下文（如果当前任务仍在推进）
- 让我输出一份项目关键状态摘要（见下方），下次新会话开头粘贴
- 在新会话中引用此摘要代替重新加载完整项目

### 方案 B：开启新会话（推荐，如果当前任务已完成）
- 复制以下「项目快照」到新会话
- 新会话将获得更准确、更快的响应

\`\`\`
## 项目关键快照（粘贴到新会话开头）

项目：当前正在编辑的项目名（请替换）
关键文件：
- src/...（列出 3-5 个核心文件路径）
- src/...
- src/...

当前进度：
- 已完成：简短描述（1-2 句话）
- 正在进行：简短描述
- 下一步：简短描述

已知约束：
- 技术栈 / 框架版本
- 已有依赖与版本
- 代码风格要求（lint 规则、命名约定等）
\`\`\`

### 建议的最小上下文
通常只需保留：
1. 当前正在修改的文件（不超过 2-3 个）
2. 核心配置（package.json / tsconfig.json 关键片段）
3. 最近一次运行的错误/警告信息（如果有）

其余文件按需加载即可，无需预先加载完整项目。`,
  },
};

// ============ 核心函数 ============

/** 根据规则条件类型选择提示模板 */
function getTemplateForRule(ruleId: string, conditionType: string): PromptTemplate {
  const directMatch = PROMPT_TEMPLATES[conditionType];
  if (directMatch) return directMatch;

  // Fallback：根据规则 ID 推断模板
  if (ruleId.includes('token') || ruleId.includes('001') || ruleId.includes('002')) {
    return PROMPT_TEMPLATES.token_threshold;
  }
  if (ruleId.includes('error') || ruleId.includes('003')) {
    return PROMPT_TEMPLATES.error_rate;
  }
  if (ruleId.includes('latency') || ruleId.includes('004')) {
    return PROMPT_TEMPLATES.latency_threshold;
  }
  return PROMPT_TEMPLATES.token_threshold;
}

/** 推断 PromptType */
function inferType(conditionType: string): PromptType {
  if (conditionType === 'error_rate') return 'error_rate_reduction';
  if (conditionType === 'latency_threshold') return 'latency_optimization';
  if (conditionType === 'context_overflow') return 'context_cleanup';
  return 'token_management';
}

/**
 * 从持久化存储加载提示注入记录
 */
export async function loadFromStorage(): Promise<void> {
  const saved = await loadJSON<PromptInjection[]>(STORAGE_KEY, []);
  injections.clear();
  saved.forEach((p) => injections.set(p.id, p));
  isLoaded = true;
  logger.info(`[PromptInjection] 从持久化加载 ${saved.length} 条提示注入记录`);
}

/** 延迟写入 */
function persist(): void {
  schedulePersist(STORAGE_KEY, () => Array.from(injections.values()));
}

/**
 * 生成一条新的提示注入
 * 由 ruleService 的 executeAction 在 inject_prompt 动作类型时调用
 */
export async function generatePrompt(
  ruleId: string,
  ruleName: string,
  conditionType: string,
  context: { tokenUsage: number; errorRate: number; avgLatency: number; requestCount: number },
): Promise<PromptInjection> {
  if (!isLoaded) await loadFromStorage();

  const template = getTemplateForRule(ruleId, conditionType);
  const content = template.build(context);

  const injection: PromptInjection = {
    id: uuidv4(),
    ruleId,
    ruleName,
    type: inferType(conditionType),
    title: template.title,
    content,
    summary: template.summary,
    status: 'generated',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    triggerContext: context,
  };

  injections.set(injection.id, injection);
  persist();
  logger.info(`[PromptInjection] 生成新提示: ${injection.id} (${injection.type})`, {
    ruleId,
    triggerCount: injections.size,
  });
  return injection;
}

/** 获取所有提示注入 */
export async function getPromptInjections(
  options: { limit?: number; status?: PromptStatus; type?: PromptType } = {},
): Promise<PromptInjection[]> {
  if (!isLoaded) await loadFromStorage();

  let list = Array.from(injections.values());

  if (options.status) {
    list = list.filter((p) => p.status === options.status);
  }
  if (options.type) {
    list = list.filter((p) => p.type === options.type);
  }

  list.sort((a, b) => b.generatedAt - a.generatedAt);

  if (options.limit && options.limit > 0) {
    list = list.slice(0, options.limit);
  }

  return list;
}

/** 获取单条提示 */
export async function getPromptInjectionById(id: string): Promise<PromptInjection | null> {
  if (!isLoaded) await loadFromStorage();
  return injections.get(id) || null;
}

/** 更新提示状态 */
export async function updatePromptStatus(
  id: string,
  status: PromptStatus,
): Promise<PromptInjection | null> {
  if (!isLoaded) await loadFromStorage();
  const injection = injections.get(id);
  if (!injection) return null;

  injection.status = status;
  injection.updatedAt = Date.now();
  if (status === 'applied') injection.appliedAt = Date.now();

  persist();
  logger.info(`[PromptInjection] 更新状态: ${id} -> ${status}`);
  return injection;
}

/** 删除一条提示 */
export async function deletePrompt(id: string): Promise<boolean> {
  if (!isLoaded) await loadFromStorage();
  const existed = injections.delete(id);
  if (existed) persist();
  return existed;
}

/** 清空所有提示（通常用于调试） */
export async function clearAllPrompts(): Promise<number> {
  if (!isLoaded) await loadFromStorage();
  const count = injections.size;
  injections.clear();
  await saveJSON(STORAGE_KEY, []);
  return count;
}

/** 统计信息（供 Dashboard 使用） */
export async function getPromptStats(): Promise<{
  total: number;
  byType: Record<PromptType, number>;
  byStatus: Record<PromptStatus, number>;
  recentlyGenerated: number;
}> {
  if (!isLoaded) await loadFromStorage();

  const byType: Record<PromptType, number> = {
    code_quality: 0,
    context_cleanup: 0,
    error_rate_reduction: 0,
    latency_optimization: 0,
    token_management: 0,
  };
  const byStatus: Record<PromptStatus, number> = {
    generated: 0,
    reviewed: 0,
    applied: 0,
    dismissed: 0,
  };

  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  let recentlyGenerated = 0;

  for (const p of injections.values()) {
    byType[p.type] = (byType[p.type] || 0) + 1;
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    if (now - p.generatedAt < oneDay) recentlyGenerated++;
  }

  return {
    total: injections.size,
    byType,
    byStatus,
    recentlyGenerated,
  };
}
