/**
 * ACOP API 集成测试
 * 测试所有 API 端点的请求和响应
 */

import { describe, it, expect } from 'vitest';
import { recordAICodeEvent } from '../../server/services/aiCodeEventService';
import { getDashboardStats, getTokenTrend, getErrorDistribution, getToolUsageStats } from '../../server/services/dashboardService';
import { getRules, createRule } from '../../server/services/ruleService';
import type { AICodeEvent } from '../../shared/types';

// 模拟的 API 测试数据
describe('API Integration Tests', () => {

  const testEvent: AICodeEvent = {
    sessionId: 'integration-test-session',
    traceId: 'integration-test-trace',
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

  describe('事件记录 API', () => {

    it('POST /api/events - 应该成功记录事件', async () => {
      const result = await recordAICodeEvent(testEvent);
      expect(result).toBeDefined();
      expect(result.sessionId).toBe(testEvent.sessionId);
      expect(result.tool).toBe('trae');
    });

    it('POST /api/events - 应该正确处理 Token 消耗', async () => {
      const result = await recordAICodeEvent(testEvent);
      expect(result.tokenConsumption.input).toBe(1000);
      expect(result.tokenConsumption.output).toBe(2000);
      expect(result.tokenConsumption.total).toBe(3000);
    });

    it('POST /api/events - 应该正确处理性能数据', async () => {
      const result = await recordAICodeEvent(testEvent);
      expect(result.performance.latency).toBe(1500);
      expect(result.performance.ttft).toBe(300);
    });

  });

  describe('仪表盘 API', () => {

    it('GET /api/dashboard/stats - 应该返回仪表盘统计', async () => {
      await recordAICodeEvent({
        ...testEvent,
        sessionId: 'dashboard-test-' + Date.now(),
      });

      const stats = await getDashboardStats();
      expect(stats).toBeDefined();
      expect(stats.totalTokens).toBeGreaterThanOrEqual(3000);
      expect(stats.totalRequests).toBeGreaterThan(0);
      expect(stats.avgLatency).toBeGreaterThan(0);
      expect(stats.errorRate).toBeGreaterThanOrEqual(0);
      expect(stats.totalCost).toBeGreaterThan(0);
    });

    it('GET /api/dashboard/token-trend - 应该返回 Token 趋势', async () => {
      const trend = await getTokenTrend(7);
      expect(trend).toBeDefined();
      expect(Array.isArray(trend)).toBe(true);
      trend.forEach((point) => {
        expect(point.date).toBeDefined();
        expect(point.totalTokens).toBeGreaterThan(0);
      });
    });

    it('GET /api/dashboard/error-distribution - 应该返回错误分布', async () => {
      const distribution = await getErrorDistribution();
      expect(distribution).toBeDefined();
      expect(Array.isArray(distribution)).toBe(true);
      distribution.forEach((item) => {
        expect(item.errorType).toBeDefined();
        expect(item.count).toBeGreaterThanOrEqual(0);
        expect(item.percentage).toBeGreaterThanOrEqual(0);
      });
    });

    it('GET /api/dashboard/tool-usage - 应该返回工具使用统计', async () => {
      const stats = await getToolUsageStats();
      expect(stats).toBeDefined();
      expect(Array.isArray(stats)).toBe(true);
      stats.forEach((item) => {
        expect(item.tool).toBeDefined();
        expect(item.requestCount).toBeGreaterThanOrEqual(0);
        expect(item.totalTokens).toBeGreaterThanOrEqual(0);
        expect(item.avgLatency).toBeGreaterThanOrEqual(0);
        expect(item.errorRate).toBeGreaterThanOrEqual(0);
      });
    });

  });

  describe('规则管理 API', () => {

    it('GET /api/rules - 应该返回所有规则', async () => {
      const rules = await getRules();
      expect(rules).toBeDefined();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
      rules.forEach((rule) => {
        expect(rule.id).toBeDefined();
        expect(rule.name).toBeDefined();
        expect(rule.condition).toBeDefined();
        expect(rule.action).toBeDefined();
      });
    });

    it('POST /api/rules - 应该创建新规则', async () => {
      const newRule = {
        id: 'integration-test-rule-' + Date.now(),
        name: '集成测试规则',
        description: '这是一个集成测试规则',
        enabled: true,
        condition: {
          type: 'token_threshold',
          threshold: 0.7,
          operator: '>',
        },
        action: {
          type: 'send_alert',
          config: { channels: ['console'] },
        },
        priority: 'low' as const,
      };

      const result = await createRule(newRule);
      expect(result).toBeDefined();
      expect(result.name).toBe('集成测试规则');
      expect(result.enabled).toBe(true);
    });

  });

  describe('数据流程完整性', () => {

    it('记录的事件应该反映在仪表盘统计中', async () => {
      // 1. 记录多个事件
      const sessionIds = ['flow-test-1', 'flow-test-2', 'flow-test-3'];
      const totalTokens = [3000, 5000, 2000];

      for (let i = 0; i < sessionIds.length; i++) {
        await recordAICodeEvent({
          ...testEvent,
          sessionId: sessionIds[i],
          traceId: 'trace-' + i,
          tokenConsumption: {
            input: Math.floor(totalTokens[i] / 3),
            output: Math.floor((totalTokens[i] / 3) * 2),
            total: totalTokens[i],
          },
        });
      }

      // 2. 检查仪表盘统计
      const stats = await getDashboardStats();
      expect(stats).toBeDefined();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(3);
    });

    it('应该正确处理多种工具类型', async () => {
      const tools: Array<'trae' | 'claude_code' | 'cursor'> = ['trae', 'claude_code', 'cursor'];
      for (let i = 0; i < 3; i++) {
        await recordAICodeEvent({
          ...testEvent,
          tool: tools[i],
          sessionId: `multi-tool-test-${i}-${Date.now()}`,
        });
      }

      const toolStats = await getToolUsageStats();
      expect(toolStats.length).toBeGreaterThan(0);
    });

  });

});
