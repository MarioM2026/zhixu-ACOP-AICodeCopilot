import { v4 as uuidv4 } from 'uuid';
import type {
  AICodeEvent,
  ContextSession,
  ContextStats,
  ContextConfig,
  ContextHistoryEntry,
  CleanupAction,
  TaskType,
  ToolType,
} from '@zhixu/shared/types';
import { getAllEvents } from './aiCodeEventService';
import { taskClassifier } from './taskClassifier';
import { modelProfileService } from './modelProfileService';
import { logger } from './logger';
import { loadJSON, saveJSON, schedulePersist } from './storageService';

const CONFIG_KEY = 'context-config';
const HISTORY_KEY = 'context-history';
const CACHE_KEY = 'context-sessions';

// 默认配置
const DEFAULT_CONFIG: ContextConfig = {
  contextLimits: {
    'claude-sonnet-4': 200000,
    'claude-3-5-sonnet-20241022': 200000,
    'claude-3-opus-20240229': 200000,
    'gpt-4o': 128000,
    'gpt-4-turbo': 128000,
    'deepseek-v3': 64000,
    'deepseek-coder-33b': 128000,
    'qwen-plus': 128000,
    'qwen-coder-32b': 128000,
    'gemini-1-5-pro': 1000000,
  },
  inactivityThresholdHours: 72,
  importanceWeights: {
    recency: 0.35,
    tokenUsage: 0.25,
    quality: 0.25,
    taskComplexity: 0.15,
  },
  cleanupThresholds: {
    archiveScore: 40,
    cleanupScore: 20,
    newSessionTokenRatio: 0.8,
  },
};

// 会话缓存（分析结果）
let sessionCache: ContextSession[] = [];
let lastAnalysisAt = 0;
const ANALYSIS_CACHE_MS = 60 * 1000; // 1分钟缓存

// 操作历史
let history: ContextHistoryEntry[] = [];
let config: ContextConfig = { ...DEFAULT_CONFIG };

// 任务类型到复杂度分数映射
const TASK_COMPLEXITY_SCORES: Record<TaskType, number> = {
  refactoring: 90,
  optimization: 85,
  code_review: 80,
  code_generation: 75,
  bug_fixing: 75,
  code_explanation: 65,
  testing: 70,
  documentation: 60,
  debugging: 70,
  research: 65,
  design_planning: 75,
  learning: 55,
  general_chat: 30,
  translation: 40,
};

/** 初始化 */
export async function initialize(): Promise<void> {
  const savedConfig = await loadJSON<ContextConfig | null>(CONFIG_KEY, null);
  if (savedConfig) {
    config = { ...DEFAULT_CONFIG, ...savedConfig };
  }
  const savedHistory = await loadJSON<ContextHistoryEntry[]>(HISTORY_KEY, []);
  history = savedHistory;
  logger.info(`[ContextManager] 初始化完成，操作历史 ${history.length} 条`);
}

/** 获取配置 */
export function getConfig(): ContextConfig {
  return { ...config };
}

/** 更新配置 */
export async function updateConfig(partial: Partial<ContextConfig>): Promise<ContextConfig> {
  config = {
    ...config,
    ...partial,
    contextLimits: { ...config.contextLimits, ...(partial.contextLimits || {}) },
    importanceWeights: { ...config.importanceWeights, ...(partial.importanceWeights || {}) },
    cleanupThresholds: { ...config.cleanupThresholds, ...(partial.cleanupThresholds || {}) },
  };
  await saveJSON(CONFIG_KEY, config);
  // 配置变更，使缓存失效
  lastAnalysisAt = 0;
  return config;
}

/** 计算某个模型的上下文上限 */
function getContextLimit(modelId: string): number {
  // 先查配置
  if (config.contextLimits[modelId]) {
    return config.contextLimits[modelId];
  }
  // 再查模型画像
  const profile = modelProfileService.getProfile(modelId);
  if (profile && profile.contextWindow) {
    return profile.contextWindow;
  }
  // 默认 128K
  return 128000;
}

/** 分析会话并生成画像 */
export async function analyzeSessions(forceRefresh = false): Promise<ContextSession[]> {
  const now = Date.now();

  // 使用缓存
  if (!forceRefresh && sessionCache.length > 0 && now - lastAnalysisAt < ANALYSIS_CACHE_MS) {
    return sessionCache.map(s => ({ ...s }));
  }

  const allEvents = await getAllEvents();
  if (allEvents.length === 0) {
    sessionCache = [];
    lastAnalysisAt = now;
    return [];
  }

  // 按 sessionId 分组
  const sessionEvents = new Map<string, AICodeEvent[]>();
  for (const ev of allEvents) {
    const key = ev.sessionId || ev.traceId || 'unknown';
    if (!sessionEvents.has(key)) {
      sessionEvents.set(key, []);
    }
    sessionEvents.get(key)!.push(ev);
  }

  // 分析每个会话
  const sessions: ContextSession[] = [];
  for (const [sessionId, evs] of sessionEvents) {
    sessions.push(buildSessionProfile(sessionId, evs, now));
  }

  // 按重要度降序排序
  sessions.sort((a, b) => b.importanceScore - a.importanceScore);

  sessionCache = sessions;
  lastAnalysisAt = now;

  // 持久化缓存
  schedulePersist(CACHE_KEY, () => sessionCache);

  logger.info(`[ContextManager] 分析完成，共 ${sessions.length} 个会话`);
  return sessions;
}

/** 构建单个会话画像 */
function buildSessionProfile(
  sessionId: string,
  evs: AICodeEvent[],
  now: number
): ContextSession {
  const sorted = [...evs].sort((a, b) => a.timestamp - b.timestamp);
  const last = sorted[sorted.length - 1];

  // 基础统计
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalLatency = 0;
  let errorCount = 0;
  let codeAcceptedCount = 0;
  let contextOverflowCount = 0;
  const taskTypeSet = new Set<TaskType>();

  for (const ev of sorted) {
    totalInputTokens += ev.tokenConsumption.input || 0;
    totalOutputTokens += ev.tokenConsumption.output || 0;
    totalLatency += ev.performance.latency || 0;
    if (ev.quality?.errorType || ev.quality?.errorMessage) {
      errorCount++;
    }
    if (ev.quality?.codeAcceptance === true) {
      codeAcceptedCount++;
    }
    if (ev.quality?.contextOverflow) {
      contextOverflowCount++;
    }
    // 从 errorMessage 中采样做任务类型推断
    const msg = ev.quality?.errorMessage || '';
    if (msg) {
      const result = taskClassifier.classify(msg);
      if (result.confidence >= 0.5) {
        taskTypeSet.add(result.type);
      }
    }
  }

  const totalTokens = totalInputTokens + totalOutputTokens;
  const eventCount = evs.length;
  const errorRate = eventCount > 0 ? errorCount / eventCount : 0;
  const codeAcceptanceRate = eventCount > 0 ? codeAcceptedCount / eventCount : 0;
  const avgLatency = eventCount > 0 ? Math.round(totalLatency / eventCount) : 0;
  const firstTimestamp = sorted[0].timestamp;
  const lastTimestamp = last.timestamp;
  const inactiveHours = Math.round((now - lastTimestamp) / (1000 * 60 * 60));

  // 重要度评分各因子
  // 1. 时效性：最近24小时=100，超过阈值=0，线性衰减
  const maxInactive = config.inactivityThresholdHours;
  let recencyScore = 100 - Math.min(100, (inactiveHours / maxInactive) * 100);
  recencyScore = Math.max(0, Math.min(100, recencyScore));

  // 2. Token 使用量：越高越重要（代表高价值会话），但超过上限反而降分
  const contextLimit = getContextLimit(last.modelId);
  const tokenRatio = totalTokens / contextLimit;
  let tokenScore = Math.min(100, tokenRatio * 150); // 2/3 达到满分
  if (tokenRatio > 0.9) {
    tokenScore = Math.max(20, tokenScore - (tokenRatio - 0.9) * 200);
  }

  // 3. 质量：代码接受率高 + 错误率低
  const qualityScore = Math.max(
    0,
    Math.min(100, codeAcceptanceRate * 80 + (1 - errorRate) * 20)
  );

  // 4. 任务复杂度：检测到的任务类型平均复杂度
  const taskTypes = Array.from(taskTypeSet);
  let complexityScore = 50;
  if (taskTypes.length > 0) {
    const avgComplexity =
      taskTypes.reduce((sum, t) => sum + (TASK_COMPLEXITY_SCORES[t] || 50), 0) /
      taskTypes.length;
    complexityScore = avgComplexity;
  }

  const w = config.importanceWeights;
  const importanceScore = Math.round(
    recencyScore * w.recency +
      tokenScore * w.tokenUsage +
      qualityScore * w.quality +
      complexityScore * w.taskComplexity
  );

  // 自动摘要
  const summaryParts: string[] = [];
  summaryParts.push(`${eventCount} 次调用`);
  summaryParts.push(`累计 ${totalTokens.toLocaleString()} tokens`);
  if (inactiveHours > 24) summaryParts.push(`${inactiveHours}h 不活动`);
  if (errorRate > 0.1) summaryParts.push(`错误率 ${(errorRate * 100).toFixed(0)}%`);
  if (contextOverflowCount > 0) summaryParts.push(`${contextOverflowCount} 次上下文溢出`);

  const summary = summaryParts.join(' · ');

  // 风险等级
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (contextOverflowCount > 0 || tokenRatio > config.cleanupThresholds.newSessionTokenRatio) {
    riskLevel = 'high';
  } else if (errorRate > 0.2 || inactiveHours > config.inactivityThresholdHours) {
    riskLevel = 'medium';
  }

  // 清理建议
  const { action, reason } = recommendAction(
    importanceScore,
    tokenRatio,
    contextOverflowCount,
    inactiveHours,
    riskLevel
  );

  return {
    sessionId,
    tool: last.tool,
    modelId: last.modelId,
    eventCount,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    avgLatency,
    errorCount,
    errorRate: Math.round(errorRate * 100) / 100,
    codeAcceptanceRate: Math.round(codeAcceptanceRate * 100) / 100,
    contextOverflowCount,
    firstTimestamp,
    lastTimestamp,
    inactiveHours,
    importanceScore,
    importanceFactors: {
      recency: Math.round(recencyScore),
      tokenUsage: Math.round(tokenScore),
      quality: Math.round(qualityScore),
      taskComplexity: Math.round(complexityScore),
    },
    taskTypes,
    summary,
    riskLevel,
    recommendedAction: action,
    recommendedActionReason: reason,
  };
}

/** 基于画像给出清理建议 */
function recommendAction(
  score: number,
  tokenRatio: number,
  overflowCount: number,
  inactiveHours: number,
  risk: string
): { action: CleanupAction; reason: string } {
  const t = config.cleanupThresholds;

  // 上下文溢出 或 Token 接近上限 → 新建会话
  if (overflowCount > 0 || tokenRatio >= t.newSessionTokenRatio) {
    return {
      action: 'new_session',
      reason:
        overflowCount > 0
          ? `检测到 ${overflowCount} 次上下文溢出，建议新建会话`
          : `Token 已达上下文上限的 ${(tokenRatio * 100).toFixed(0)}%，建议新建会话`,
    };
  }

  // 低重要度 + 长期不活动 → 清理
  if (score < t.cleanupScore && inactiveHours > config.inactivityThresholdHours) {
    return {
      action: 'cleanup',
      reason: `重要度 ${score}，${inactiveHours}h 不活动，可清理`,
    };
  }

  // 中低重要度 + 不活动 → 归档
  if (score < t.archiveScore && inactiveHours > 24) {
    return {
      action: 'archive',
      reason: `重要度 ${score}，${inactiveHours}h 不活动，建议归档`,
    };
  }

  // 高风险但活跃 → 新建会话
  if (risk === 'high' && score > 60) {
    return {
      action: 'new_session',
      reason: '高风险会话，建议新建会话以避免质量下降',
    };
  }

  return { action: 'keep', reason: '会话状态良好，保持当前会话' };
}

/** 获取单个会话画像 */
export async function getSession(sessionId: string): Promise<ContextSession | null> {
  const sessions = await analyzeSessions();
  return sessions.find(s => s.sessionId === sessionId) || null;
}

/** 获取单个会话的事件列表 */
export async function getSessionEvents(
  sessionId: string,
  limit = 20
): Promise<AICodeEvent[]> {
  const allEvents = await getAllEvents();
  const sessionEvents = allEvents.filter(
    ev => (ev.sessionId || ev.traceId || 'unknown') === sessionId
  );
  // 按时间降序排序，取最近 N 条
  sessionEvents.sort((a, b) => b.timestamp - a.timestamp);
  return sessionEvents.slice(0, limit);
}

/** 获取整体统计 */
export async function getStats(): Promise<ContextStats> {
  const sessions = await analyzeSessions();

  const sessionsByTool = {} as Record<ToolType, number>;
  const sessionsByRisk = { low: 0, medium: 0, high: 0 } as Record<
    'low' | 'medium' | 'high',
    number
  >;

  let totalTokens = 0;
  let atRisk = 0;
  let overflowSessions = 0;
  let inactiveSessions = 0;
  let archiveCount = 0;
  let cleanupCount = 0;
  let newSessionCount = 0;

  for (const s of sessions) {
    totalTokens += s.totalTokens;
    sessionsByTool[s.tool] = (sessionsByTool[s.tool] || 0) + 1;
    sessionsByRisk[s.riskLevel]++;
    if (s.riskLevel === 'high') atRisk++;
    if (s.contextOverflowCount > 0) overflowSessions++;
    if (s.inactiveHours > config.inactivityThresholdHours) inactiveSessions++;
    if (s.recommendedAction === 'archive') archiveCount++;
    if (s.recommendedAction === 'cleanup') cleanupCount++;
    if (s.recommendedAction === 'new_session') newSessionCount++;
  }

  return {
    totalSessions: sessions.length,
    totalTokens,
    atRiskSessions: atRisk,
    overflowSessions,
    inactiveSessions,
    avgTokensPerSession: sessions.length > 0 ? Math.round(totalTokens / sessions.length) : 0,
    recommendedArchiveCount: archiveCount,
    recommendedCleanupCount: cleanupCount,
    recommendedNewSessionCount: newSessionCount,
    sessionsByTool,
    sessionsByRisk,
  };
}

/** 记录清理/归档操作 */
export async function recordAction(
  sessionId: string,
  action: CleanupAction,
  reason: string
): Promise<ContextHistoryEntry> {
  const session = await getSession(sessionId);
  const entry: ContextHistoryEntry = {
    id: uuidv4(),
    sessionId,
    action,
    actionAt: Date.now(),
    reason,
    snapshot: session
      ? {
          eventCount: session.eventCount,
          totalTokens: session.totalTokens,
          importanceScore: session.importanceScore,
        }
      : { eventCount: 0, totalTokens: 0, importanceScore: 0 },
  };
  history.unshift(entry);
  await saveJSON(HISTORY_KEY, history.slice(0, 500)); // 保留最近500条
  logger.info(`[ContextManager] 记录操作: ${action} - ${sessionId}`);
  return entry;
}

/** 获取操作历史 */
export function getHistory(limit = 50): ContextHistoryEntry[] {
  return history.slice(0, limit);
}

/** 服务聚合导出 */
export const contextManagerService = {
  initialize,
  getConfig,
  updateConfig,
  analyzeSessions,
  getSession,
  getSessionEvents,
  getStats,
  recordAction,
  getHistory,
};
