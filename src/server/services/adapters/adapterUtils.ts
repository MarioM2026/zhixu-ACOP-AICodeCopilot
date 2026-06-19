import fs from 'fs';
import path from 'path';
import type { AICodeEvent, ToolType } from '@zhixu/shared/types';
import { v4 as uuidv4 } from 'uuid';

export interface ScanResult {
  events: AICodeEvent[];
  pathsScanned: string[];
  pathsFound: string[];
}

export function resolveHome(p: string): string {
  const home = process.env.USERPROFILE || process.env.HOME || '/';
  return p.replace(/^~/, home).replace(/%([^%]+)%/g, (_, env) => {
    return process.env[env] || '';
  });
}

export function findExistingDir(candidates: string[]): string | null {
  for (const raw of candidates) {
    const p = resolveHome(raw);
    if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return p;
    }
  }
  return null;
}

function safeReadFile(filePath: string, maxBytes: number = 5 * 1024 * 1024): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return '';
    // 对于大文件，只读取最新部分
    if (stat.size > maxBytes) {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(maxBytes);
      const offset = stat.size - maxBytes;
      fs.readSync(fd, buffer, 0, maxBytes, offset);
      fs.closeSync(fd);
      return buffer.toString('utf-8');
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function listLogFiles(dir: string, maxFiles: number = 15): string[] {
  try {
    function collectRecursive(currentDir: string, depth: number): string[] {
      if (depth > 4) return []; // 避免无限递归
      const result: string[] = [];
      try {
        const items = fs.readdirSync(currentDir);
        for (const item of items) {
          const fullPath = path.join(currentDir, item);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              result.push(...collectRecursive(fullPath, depth + 1));
            } else if (stat.isFile() && item.endsWith('.log')) {
              result.push(fullPath);
            }
          } catch (e) {} // 权限问题等跳过
        }
      } catch (e) {}
      return result;
    }

    const files = collectRecursive(dir, 0);
    return files
      .sort((a, b) => {
        try {
          return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
        } catch {
          return 0;
        }
      })
      .slice(0, maxFiles);
  } catch {
    return [];
  }
}

/**
 * 尝试从一段文本中提取 token 数
 * 常见格式: "prompt_tokens": 1000, "tokens used": 500, "input": 300 等
 */
function extractNumber(text: string, keys: string[]): number {
  for (const k of keys) {
    const re = new RegExp(`["']?${k}["']?\\s*[:=]\\s*(\\d+)`, 'i');
    const m = text.match(re);
    if (m && m[1]) return parseInt(m[1], 10);
  }
  return 0;
}

/**
 * 解析一段内容，可能是 JSON、JSON Lines 或混合文本
 * 返回所有能识别到的事件
 */
export function parseGenericContent(
  content: string,
  toolType: ToolType,
  defaultModel: string,
): AICodeEvent[] {
  const events: AICodeEvent[] = [];
  if (!content || content.trim().length === 0) return events;

  // 方案 1: 整体是 JSON 数组
  try {
    const arr = JSON.parse(content);
    if (Array.isArray(arr)) {
      for (const obj of arr) {
        const ev = extractEventFromObject(obj, toolType, defaultModel);
        if (ev) events.push(ev);
      }
      if (events.length > 0) return events;
    } else if (typeof arr === 'object' && arr !== null) {
      const ev = extractEventFromObject(arr, toolType, defaultModel);
      if (ev) events.push(ev);
      if (events.length > 0) return events;
    }
  } catch { /* 不是纯 JSON，继续 */ }

  // 方案 2: 逐行 JSON（NDJSON）
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const ev = extractEventFromObject(obj, toolType, defaultModel);
      if (ev) events.push(ev);
    } catch { /* 非 JSON 行，忽略 */ }
  }

  if (events.length > 0) return events;

  // 方案 3: 从纯文本行中提取（针对 IDE 日志中的结构化片段）
  for (const line of lines) {
    const ev = extractEventFromTextLine(line, toolType, defaultModel);
    if (ev) events.push(ev);
  }

  return events;
}

function extractEventFromObject(obj: any, toolType: ToolType, defaultModel: string): AICodeEvent | null {
  if (!obj || typeof obj !== 'object') return null;

  // 必须有一个事件标记字段
  const hasMarker = obj.type || obj.event || obj.action || obj.kind || obj.status
    || obj.tokenUsage || obj.usage || obj.tokens || obj.inputTokens !== undefined;
  if (!hasMarker) return null;

  const inputTokens =
    obj.tokenUsage?.prompt || obj.tokens?.prompt || obj.usage?.prompt_tokens
    || obj.input_tokens || obj.inputTokens || obj.prompt_tokens || extractNumber(JSON.stringify(obj), ['prompt_tokens', 'input_tokens', 'input', 'prompt']);
  const outputTokens =
    obj.tokenUsage?.completion || obj.tokens?.completion || obj.usage?.completion_tokens
    || obj.output_tokens || obj.outputTokens || obj.completion_tokens || extractNumber(JSON.stringify(obj), ['completion_tokens', 'output_tokens', 'output', 'completion']);

  if (inputTokens === 0 && outputTokens === 0) return null;

  const ts = obj.timestamp || obj.time || obj.created_at || Date.now();
  const timestamp = typeof ts === 'string' ? new Date(ts).getTime() || Date.now() : (typeof ts === 'number' ? ts : Date.now());
  const latency = obj.durationMs || obj.latency || obj.duration || obj.response_time || 0;
  const model = obj.model || obj.modelId || obj.model_name || defaultModel;
  const sessionId = obj.sessionId || obj.session_id || obj.conversationId || obj.conversation_id || uuidv4();
  const traceId = obj.traceId || obj.trace_id || obj.request_id || obj.requestId || uuidv4();

  const errorType = obj.error || obj.errorType || obj.error_type;

  return {
    id: uuidv4(),
    tool: toolType,
    sessionId: String(sessionId),
    traceId: String(traceId),
    modelId: String(model),
    timestamp,
    tokenConsumption: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    },
    performance: {
      latency,
      ttft: obj.ttft || Math.min(Math.floor(latency * 0.3), 2000),
    },
    quality: errorType ? { errorType: String(errorType), codeAcceptance: false } : undefined,
  };
}

function extractEventFromTextLine(line: string, toolType: ToolType, defaultModel: string): AICodeEvent | null {
  const inputTokens = extractNumber(line, ['prompt_tokens', 'input_tokens', 'input', 'prompt']);
  const outputTokens = extractNumber(line, ['completion_tokens', 'output_tokens', 'output', 'completion']);
  if (inputTokens === 0 && outputTokens === 0) return null;

  const latency = extractNumber(line, ['latency', 'duration', 'response_time']);

  return {
    id: uuidv4(),
    tool: toolType,
    sessionId: uuidv4(),
    traceId: uuidv4(),
    modelId: defaultModel,
    timestamp: Date.now(),
    tokenConsumption: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    },
    performance: {
      latency,
      ttft: Math.min(Math.floor(latency * 0.3), 2000),
    },
  };
}

/**
 * 专门解析 Trae AI Agent 的 Rust tracing 格式日志
 * 从 ai-agent_*_stdout.log 中提取 session_id、trace_id、duration、model 等信息
 */
export function parseTraeLog(content: string, defaultModel: string): AICodeEvent[] {
  const events: AICodeEvent[] = [];
  if (!content || content.trim().length === 0) return events;

  // 按 session_id 聚合信息
  const sessionInfo: Record<string, {
    timestamps: number[];
    traceIds: string[];
    durations: number[];
    modelNames: string[];
    lineCount: number;
  }> = {};

  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

  for (const line of lines) {
    // 1. 提取 timestamp (开头 ISO 格式)
    const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)/);
    const timestamp = timeMatch ? new Date(timeMatch[1]).getTime() : Date.now();

    // 2. 提取 session_id (格式: session_id: Some("xxx") 或 session_id="xxx")
    // 要求 session_id 至少 8 个字符，过滤掉 "ai"/"code" 等短关键字
    const sessionMatch = line.match(/session_id(?:\s*:\s*|\s*=\s*)(?:Some\("([^"]+)"|Some\(\s*"([^"]+)"|"?([A-Za-z0-9\-]+)"?)/);
    const sessionId = sessionMatch ? (sessionMatch[1] || sessionMatch[2] || sessionMatch[3]) : null;

    if (!sessionId || sessionId.toLowerCase() === 'none' || sessionId.length < 8) continue;

    // 3. 提取 trace_id
    const traceMatch = line.match(/trace_id(?:\s*[:=]\s*)"?([A-Za-z0-9\-]+)"?/);
    const traceId = traceMatch ? traceMatch[1] : null;

    // 4. 提取 duration (格式: total_duration=116.5981ms 或 duration_ms:0)
    const durationMatch = line.match(/(?:total_duration|duration|latency|time_cost)[^\d]*(\d+(?:\.\d+)?)\s*(ms|ns|μs|us|s)?/i);
    let durationMs = 0;
    if (durationMatch) {
      const raw = parseFloat(durationMatch[1]);
      const unit = (durationMatch[2] || 'ms').toLowerCase();
      if (unit === 'ns') durationMs = raw / 1000000;
      else if (unit === 'us' || unit === 'μs') durationMs = raw / 1000;
      else if (unit === 's') durationMs = raw * 1000;
      else durationMs = raw; // ms
    }

    // 5. 提取 model_name
    const modelMatch = line.match(/model_name(?:\s*:\s*|\s*=\s*)"?([^",}\]\s]+)"?/);
    const modelName = modelMatch ? modelMatch[1] : null;

    // 聚合到 session
    if (!sessionInfo[sessionId]) {
      sessionInfo[sessionId] = { timestamps: [], traceIds: [], durations: [], modelNames: [], lineCount: 0 };
    }
    sessionInfo[sessionId].timestamps.push(timestamp);
    sessionInfo[sessionId].lineCount++;
    if (traceId) sessionInfo[sessionId].traceIds.push(traceId);
    if (durationMs > 0) sessionInfo[sessionId].durations.push(durationMs);
    if (modelName) sessionInfo[sessionId].modelNames.push(modelName);
  }

  // 为每个 session 生成事件
  for (const [sessionId, info] of Object.entries(sessionInfo)) {
    // 跳过太短/可能噪声的 session
    if (info.lineCount < 5) continue;

    const minTime = Math.min(...info.timestamps);
    const maxTime = Math.max(...info.timestamps);
    const avgDuration = info.durations.length > 0
      ? Math.round(info.durations.reduce((s, x) => s + x, 0) / info.durations.length)
      : Math.max(100, Math.round((maxTime - minTime) / Math.max(info.lineCount, 1)));

    // 估算 token: 基于 traceId 数量（每次 AI 调用会有一个 traceId）和 duration
    // 一个 traceId ≈ 一次 AI 调用，典型值 800-3000 tokens
    const callCount = Math.max(1, info.traceIds.length);
    const tokensPerCall = Math.max(400, Math.min(3000, 500 + avgDuration));
    const estimatedTokens = Math.min(5000, callCount * tokensPerCall);
    const inputTokens = Math.round(estimatedTokens * 0.6);
    const outputTokens = Math.round(estimatedTokens * 0.4);

    // 选择最常见的模型
    const model = info.modelNames.length > 0
      ? info.modelNames[0]
      : defaultModel;

    events.push({
      id: uuidv4(),
      tool: 'trae',
      sessionId,
      traceId: info.traceIds.length > 0 ? info.traceIds[0] : sessionId,
      modelId: model,
      timestamp: maxTime,
      tokenConsumption: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      performance: {
        latency: avgDuration,
        ttft: Math.round(avgDuration * 0.3),
      },
    });
  }

  return events;
}

/**
 * 扫描单个目录中的所有文件，提取事件
 */
export function scanDirectoryForEvents(
  dir: string,
  toolType: ToolType,
  defaultModel: string,
  processedMap: Record<string, number>,
  maxEventsPerRun: number = 50,
): AICodeEvent[] {
  const events: AICodeEvent[] = [];

  if (!fs.existsSync(dir)) return events;

  const files = listLogFiles(dir, 15); // 增加到 15 个（之前是 10）
  for (const filePath of files) {
    if (events.length >= maxEventsPerRun) break;

    try {
      const stat = fs.statSync(filePath);
      const lastSize = processedMap[filePath] || 0;
      const isNew = lastSize === 0;

      if (!isNew && stat.size <= lastSize) continue;

      let content: string | null = null;
      if (isNew) {
        // 新文件：读取全部内容（最多 10MB）
        content = safeReadFile(filePath, 10 * 1024 * 1024);
      } else {
        // 已有文件：仅读取新增部分
        const increment = stat.size - lastSize;
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(Math.min(increment, 5 * 1024 * 1024));
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, lastSize);
        fs.closeSync(fd);
        content = bytesRead > 0 ? buf.toString('utf8', 0, bytesRead) : '';
      }
      if (content === null || content.length === 0) continue;

      // Trae 的 ai-agent stdout 日志用专用解析器，其他用通用解析器
      let parsedEvents: AICodeEvent[] = [];
      const fileName = path.basename(filePath).toLowerCase();
      if (fileName.includes('ai-agent') || fileName.includes('trae') || fileName.includes('chat_turn')) {
        parsedEvents = parseTraeLog(content, defaultModel);
      }
      // 也尝试用通用解析器（如果是 JSON/JSONL 格式）
      if (parsedEvents.length === 0) {
        parsedEvents = parseGenericContent(content, toolType, defaultModel);
      }

      processedMap[filePath] = stat.size;

      if (parsedEvents.length > 0) {
        for (const ev of parsedEvents) {
          if (events.length >= maxEventsPerRun) break;
          events.push(ev);
        }
      }
    } catch { /* 静默 */ }
  }

  return events;
}
