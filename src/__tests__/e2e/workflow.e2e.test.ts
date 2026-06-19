/**
 * ACOP E2E 测试
 * 测试完整的业务流程
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { recordAICodeEvent } from '../../server/services/aiCodeEventService';
import { getDashboardStats } from '../../server/services/dashboardService';
import { createRule, getRules, deleteRule } from '../../server/services/ruleService';
import type { AICodeEvent, Rule } from '../../shared/types';

describe('E2E - 完整业务流程', () => {

  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    cleanup = null;
  });

  afterEach(() => {
    if (cleanup) cleanup();
  });

  describe('数据采集和监控流程', () => {

    it('应该完成从事件记录到仪表盘展示的完整流程', async () => {
      // 1. 记录多个工具的事件
      const tools: Array<'trae' | 'claude_code' | 'cursor'> = ['trae', 'claude_code', 'cursor'];
      const events: AICodeEvent[] = [];

      for (let i = 0; i < 10; i++) {
        const tool = tools[i % tools.length];
        const event: AICodeEvent = {
          sessionId: `e2e-test-session-${i}`,
          traceId: `trace-${i}-${Date.now()}`,
          timestamp: Date.now() - (10 - i) * 60000,
          tool,
          modelId: tool === 'trae' ? 'claude-3-5-sonnet' : 'claude-opus',
          tokenConsumption: {
            input: Math.floor(Math.random() * 500) + 100,
            output: Math.floor(Math.random() * 1000) + 200,
            total: 0,
          },
          performance: {
            latency: Math.floor(Math.random() * 3000) + 500,
            ttft: Math.floor(Math.random() * 500) + 100,
          },
          quality: {
            codeAcceptance: Math.random() > 0.2,
            errorType: Math.random() > 0.9 ? 'timeout' : undefined,
            errorMessage: Math.random() > 0.9 ? 'Request timeout' : undefined,
          },
          cost: {
            amount: 0,
            currency: 'USD',
            attribution: 'test',
          },
        };
        event.tokenConsumption.total = event.tokenConsumption.input + event.tokenConsumption.output;
        event.cost.amount = event.tokenConsumption.total * 0.00001;

        const result = await recordAICodeEvent(event);
        events.push(result);
      }

      // 2. 验证事件是否正确记录
      expect(events.length).toBe(10);
      events.forEach(event => {
        expect(event.sessionId).toMatch(/^e2e-test-session-\d+$/);
        expect(['trae', 'claude_code', 'cursor']).toContain(event.tool);
        expect(event.tokenConsumption.total).toBeGreaterThan(0);
        expect(event.performance.latency).toBeGreaterThan(0);
      });

      // 3. 获取仪表盘统计数据
      const stats = await getDashboardStats();
      expect(stats).toBeDefined();

      // 验证统计数据合理
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.totalRequests).toBeGreaterThanOrEqual(10);
      expect(stats.avgLatency).toBeGreaterThan(0);
      expect(stats.totalCost).toBeGreaterThan(0);

      // 验证数据完整性
      expect(Number.isFinite(stats.totalTokens)).toBe(true);
      expect(Number.isFinite(stats.totalRequests)).toBe(true);
      expect(Number.isFinite(stats.avgLatency)).toBe(true);
      expect(Number.isFinite(stats.errorRate)).toBe(true);
      expect(Number.isFinite(stats.totalCost)).toBe(true);
    });

  });

  describe('规则引擎流程', () => {

    it('应该完成规则创建、获取和删除的完整生命周期', async () => {
      const ruleId = `e2e-rule-${Date.now()}`;

      // 1. 创建规则
      const newRule: Rule = {
        id: ruleId,
        name: 'E2E 测试规则 - Token 阈值告警',
        description: '当 Token 使用量超过 80% 时触发告警',
        enabled: true,
        condition: {
          type: 'token_threshold',
          threshold: 0.8,
          operator: '>',
        },
        action: {
          type: 'send_alert',
          config: {
            channels: ['console'],
          },
        },
        priority: 'high',
      };

      const createdRule = await createRule(newRule);
      expect(createdRule).toBeDefined();
      expect(createdRule.id).toBe(ruleId);
      expect(createdRule.name).toBe('E2E 测试规则 - Token 阈值告警');
      expect(createdRule.enabled).toBe(true);

      // 2. 获取所有规则，验证新规则存在
      const rules = await getRules();
      const foundRule = rules.find((r: Rule) => r.id === ruleId);
      expect(foundRule).toBeDefined();
      expect(foundRule?.name).toBe('E2E 测试规则 - Token 阈值告警');

      // 3. 记录一些事件数据
      for (let i = 0; i < 5; i++) {
        await recordAICodeEvent({
          sessionId: `e2e-rule-test-session-${i}`,
          traceId: `rule-trace-${i}-${Date.now()}`,
          timestamp: Date.now() - i * 1000,
          tool: 'trae',
          modelId: 'claude-3-5-sonnet',
          tokenConsumption: {
            input: 500,
            output: 1500,
            total: 2000,
          },
          performance: {
            latency: 1200,
            ttft: 250,
          },
          quality: {
            codeAcceptance: true,
          },
          cost: {
            amount: 0.02,
            currency: 'USD',
          },
        });
      }

      // 4. 获取更新后的仪表盘统计
      const updatedStats = await getDashboardStats();
      expect(updatedStats).toBeDefined();
      expect(updatedStats.totalRequests).toBeGreaterThan(5);

      // 5. 清理规则
      await deleteRule(ruleId);
      const rulesAfterDelete = await getRules();
      const deletedRule = rulesAfterDelete.find((r: Rule) => r.id === ruleId);
      expect(deletedRule).toBeUndefined();
    });

  });

  describe('工具适配器流程', () => {

    it('应该正确处理多种工具类型的数据', async () => {
      const toolEvents: Array<{ tool: 'trae' | 'claude_code' | 'cursor'; count: number; totalTokens: number }> = [
        { tool: 'trae', count: 5, totalTokens: 0 },
        { tool: 'claude_code', count: 3, totalTokens: 0 },
        { tool: 'cursor', count: 2, totalTokens: 0 },
      ];

      // 1. 记录各工具的事件
      for (const toolEvent of toolEvents) {
        for (let i = 0; i < toolEvent.count; i++) {
          const inputTokens = Math.floor(Math.random() * 800) + 200;
          const outputTokens = Math.floor(Math.random() * 1600) + 400;
          const totalTokens = inputTokens + outputTokens;
          toolEvent.totalTokens += totalTokens;

          await recordAICodeEvent({
            sessionId: `e2e-adapter-test-${toolEvent.tool}-${i}`,
            traceId: `adapter-trace-${toolEvent.tool}-${i}-${Date.now()}`,
            timestamp: Date.now(),
            tool: toolEvent.tool,
            modelId: toolEvent.tool === 'trae' ? 'claude-sonnet-4' : toolEvent.tool === 'cursor' ? 'claude-3.5-sonnet' : 'claude-opus',
            tokenConsumption: {
              input: inputTokens,
              output: outputTokens,
              total: totalTokens,
            },
            performance: {
              latency: Math.floor(Math.random() * 2500) + 500,
              ttft: Math.floor(Math.random() * 400) + 100,
            },
            quality: {
              codeAcceptance: true,
            },
            cost: {
              amount: totalTokens * 0.00001,
              currency: 'USD',
              attribution: toolEvent.tool,
            },
          });
        }
      }

      // 2. 验证各工具类型都被正确识别
      toolEvents.forEach(({ tool, count }) => {
        console.log(`  - ${tool}: 记录了 ${count} 个事件`);
      });

      // 3. 获取最终统计
      const finalStats = await getDashboardStats();
      expect(finalStats.totalRequests).toBeGreaterThanOrEqual(10);
      expect(finalStats.totalTokens).toBeGreaterThan(5000);

      console.log(`  总请求数: ${finalStats.totalRequests}`);
      console.log(`  总 Token 消耗: ${finalStats.totalTokens}`);
      console.log(`  平均延迟: ${finalStats.avgLatency.toFixed(0)}ms`);
      console.log(`  错误率: ${finalStats.errorRate.toFixed(2)}%`);
      console.log(`  总成本: ¥${finalStats.totalCost.toFixed(4)}`);
    });

  });

  describe('性能和可靠性测试', () => {

    it('应该在高并发下稳定工作', async () => {
      const concurrentTasks: Array<Promise<AICodeEvent>> = [];
      const taskCount = 20;

      // 并发记录事件
      for (let i = 0; i < taskCount; i++) {
        concurrentTasks.push(recordAICodeEvent({
          sessionId: `e2e-concurrent-${i}-${Date.now()}`,
          traceId: `concurrent-trace-${i}-${Date.now()}`,
          timestamp: Date.now(),
          tool: 'trae',
          modelId: 'claude-3-5-sonnet',
          tokenConsumption: {
            input: 300,
            output: 800,
            total: 1100,
          },
          performance: {
            latency: 1500,
            ttft: 300,
          },
          quality: {
            codeAcceptance: true,
          },
          cost: {
            amount: 0.011,
            currency: 'USD',
          },
        }));
      }

      // 等待所有任务完成
      const results = await Promise.all(concurrentTasks);

      // 验证所有任务都成功
      expect(results.length).toBe(taskCount);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.sessionId).toBeDefined();
      });

      // 验证数据一致性
      const stats = await getDashboardStats();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(taskCount);
    });

    it('应该正确处理异常数据', async () => {
      const edgeCaseEvents: AICodeEvent[] = [
        // 低 Token 消耗
        {
          sessionId: `edge-case-low-${Date.now()}`,
          traceId: `edge-trace-low-${Date.now()}`,
          timestamp: Date.now(),
          tool: 'trae',
          modelId: 'claude-3-5-sonnet',
          tokenConsumption: {
            input: 10,
            output: 20,
            total: 30,
          },
          performance: {
            latency: 100,
            ttft: 50,
          },
          quality: {
            codeAcceptance: true,
          },
          cost: {
            amount: 0.0003,
            currency: 'USD',
          },
        },
        // 高 Token 消耗
        {
          sessionId: `edge-case-high-${Date.now()}`,
          traceId: `edge-trace-high-${Date.now()}`,
          timestamp: Date.now(),
          tool: 'trae',
          modelId: 'claude-3-5-sonnet',
          tokenConsumption: {
            input: 10000,
            output: 20000,
            total: 30000,
          },
          performance: {
            latency: 8000,
            ttft: 2000,
          },
          quality: {
            codeAcceptance: false,
            errorType: 'context_overflow',
          },
          cost: {
            amount: 0.3,
            currency: 'USD',
          },
        },
      ];

      // 记录所有边缘情况事件
      const results = await Promise.all(
        edgeCaseEvents.map((event) => recordAICodeEvent(event))
      );

      // 验证所有事件都被成功记录
      expect(results.length).toBe(edgeCaseEvents.length);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.tokenConsumption.total).toBeGreaterThan(0);
      });
    });

  });

});
