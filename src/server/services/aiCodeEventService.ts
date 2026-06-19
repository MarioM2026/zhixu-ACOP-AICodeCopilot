import { v4 as uuidv4 } from 'uuid';
import type { AICodeEvent, ApiResponse } from '@zhixu/shared/types';
import { logger } from './logger';

// 内存存储（开发环境使用，生产环境应使用数据库）
const events: Map<string, AICodeEvent> = new Map();

// 记录 AI 代码事件
export async function recordAICodeEvent(event: AICodeEvent): Promise<AICodeEvent> {
  const id = uuidv4();
  const newEvent: AICodeEvent = {
    ...event,
    traceId: event.traceId || uuidv4(),
    timestamp: event.timestamp || Date.now(),
  };

  events.set(id, newEvent);
  logger.info(`Recorded AI code event: ${id}`, { tool: event.tool, sessionId: event.sessionId });

  return newEvent;
}

// 获取事件列表（带分页）
export async function getEvents(params: {
  page: number;
  pageSize: number;
  tool?: string;
  startTime?: number;
  endTime?: number;
}): Promise<{ data: AICodeEvent[]; pagination: { page: number; pageSize: number; total: number } }> {
  let filteredEvents = Array.from(events.values());

  // 按工具类型过滤
  if (params.tool) {
    filteredEvents = filteredEvents.filter((e) => e.tool === params.tool);
  }

  // 按时间范围过滤
  if (params.startTime) {
    filteredEvents = filteredEvents.filter((e) => e.timestamp >= params.startTime!);
  }
  if (params.endTime) {
    filteredEvents = filteredEvents.filter((e) => e.timestamp <= params.endTime!);
  }

  // 按时间倒序
  filteredEvents.sort((a, b) => b.timestamp - a.timestamp);

  // 分页
  const total = filteredEvents.length;
  const start = (params.page - 1) * params.pageSize;
  const end = start + params.pageSize;
  const paginatedEvents = filteredEvents.slice(start, end);

  return {
    data: paginatedEvents,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
    },
  };
}

// 获取单个事件
export async function getEventById(id: string): Promise<AICodeEvent | null> {
  return events.get(id) || null;
}

// 获取事件统计
export async function getEventStats(): Promise<{
  total: number;
  byTool: Record<string, number>;
}> {
  const allEvents = Array.from(events.values());
  const byTool: Record<string, number> = {};

  for (const event of allEvents) {
    byTool[event.tool] = (byTool[event.tool] || 0) + 1;
  }

  return {
    total: allEvents.length,
    byTool,
  };
}

// 获取最近的事件（用于规则引擎评估）
export async function getRecentEvents(limit: number = 100): Promise<AICodeEvent[]> {
  const allEvents = Array.from(events.values());
  return allEvents
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}
