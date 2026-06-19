/**
 * AICodeEventService 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { recordAICodeEvent, getEvents, getEventById, getEventStats } from '@/server/services/aiCodeEventService';
import type { AICodeEvent } from '@zhixu/shared/types';

describe('AICodeEventService', () => {
  const mockEvent: AICodeEvent = {
    sessionId: 'test-session-123',
    traceId: 'test-trace-456',
    timestamp: Date.now(),
    tool: 'trae',
    modelId: 'claude-3-5-sonnet',
    tokenConsumption: {
      input: 1000,
      output: 2000,
      total: 3000,
    },
    performance: {
      latency: 1500,
      ttft: 300,
    },
    quality: {
      codeAcceptance: true,
    },
    cost: {
      amount: 0.03,
      currency: 'USD',
    },
  };

  beforeEach(() => {
    // 每个测试前重置服务状态
  });

  describe('recordAICodeEvent', () => {
    it('should record an AI code event successfully', async () => {
      const result = await recordAICodeEvent(mockEvent);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe(mockEvent.sessionId);
      expect(result.tool).toBe('trae');
      expect(result.tokenConsumption.total).toBe(3000);
    });

    it('should generate traceId if not provided', async () => {
      const eventWithoutTraceId = { ...mockEvent, traceId: undefined as unknown as string };
      const result = await recordAICodeEvent(eventWithoutTraceId);

      expect(result.traceId).toBeDefined();
      expect(result.traceId).not.toBeUndefined();
    });

    it('should use current timestamp if not provided', async () => {
      const eventWithoutTimestamp = { ...mockEvent, timestamp: undefined as unknown as number };
      const result = await recordAICodeEvent(eventWithoutTimestamp);

      expect(result.timestamp).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getEvents', () => {
    it('should return paginated events', async () => {
      // 先记录几个事件
      await recordAICodeEvent(mockEvent);
      await recordAICodeEvent({ ...mockEvent, sessionId: 'session-2' });
      await recordAICodeEvent({ ...mockEvent, sessionId: 'session-3' });

      const result = await getEvents({
        page: 1,
        pageSize: 10,
      });

      expect(result.data).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(10);
    });

    it('should filter events by tool', async () => {
      await recordAICodeEvent(mockEvent);
      await recordAICodeEvent({ ...mockEvent, tool: 'claude_code', sessionId: 'claude-session' });

      const result = await getEvents({
        page: 1,
        pageSize: 10,
        tool: 'trae',
      });

      expect(result.data.length).toBeGreaterThan(0);
      result.data.forEach((event) => {
        expect(event.tool).toBe('trae');
      });
    });

    it('should filter events by time range', async () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;

      await recordAICodeEvent({ ...mockEvent, timestamp: oneHourAgo, sessionId: 'recent' });
      await recordAICodeEvent({ ...mockEvent, timestamp: twoHoursAgo, sessionId: 'old' });

      const result = await getEvents({
        page: 1,
        pageSize: 10,
        startTime: oneHourAgo - 1000,
      });

      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should sort events by timestamp descending', async () => {
      const now = Date.now();
      await recordAICodeEvent({ ...mockEvent, timestamp: now - 1000, sessionId: 'older' });
      await recordAICodeEvent({ ...mockEvent, timestamp: now, sessionId: 'newer' });

      const result = await getEvents({
        page: 1,
        pageSize: 10,
      });

      expect(result.data[0].sessionId).toBe('newer');
    });
  });

  describe('getEventById', () => {
    it('should return null for non-existent event', async () => {
      const result = await getEventById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getEventStats', () => {
    it('should return correct statistics', async () => {
      await recordAICodeEvent(mockEvent);
      await recordAICodeEvent({ ...mockEvent, tool: 'trae', sessionId: 'trae-2' });
      await recordAICodeEvent({ ...mockEvent, tool: 'claude_code', sessionId: 'claude-1' });

      const stats = await getEventStats();

      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.byTool).toBeDefined();
      expect(stats.byTool.trae).toBeGreaterThanOrEqual(2);
      expect(stats.byTool.claude_code).toBeGreaterThanOrEqual(1);
    });
  });
});
