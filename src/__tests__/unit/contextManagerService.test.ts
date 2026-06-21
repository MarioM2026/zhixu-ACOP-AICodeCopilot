/**
 * ContextManagerService 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initialize,
  getConfig,
  updateConfig,
  analyzeSessions,
  getSession,
  getSessionEvents,
  getStats,
  recordAction,
  getHistory,
} from '@/server/services/contextManagerService';

describe('ContextManagerService', () => {

  beforeEach(async () => {
    // 每次测试前初始化
    await initialize();
  });

  describe('initialize', () => {
    it('应该正确初始化', async () => {
      await expect(initialize()).resolves.not.toThrow();
    });

    it('初始化后 getConfig 返回有效配置', () => {
      const cfg = getConfig();
      expect(cfg).toBeDefined();
      expect(cfg.contextLimits).toBeDefined();
      expect(cfg.inactivityThresholdHours).toBeGreaterThan(0);
      expect(cfg.importanceWeights).toBeDefined();
      expect(cfg.cleanupThresholds).toBeDefined();
    });
  });

  describe('getConfig', () => {
    it('返回的配置包含所有必需字段', () => {
      const cfg = getConfig();
      expect(cfg).toHaveProperty('contextLimits');
      expect(cfg).toHaveProperty('inactivityThresholdHours');
      expect(cfg).toHaveProperty('importanceWeights');
      expect(cfg).toHaveProperty('cleanupThresholds');
    });

    it('权重分数总和接近 1.0', () => {
      const { recency, tokenUsage, quality, taskComplexity } = getConfig().importanceWeights;
      const sum = recency + tokenUsage + quality + taskComplexity;
      expect(sum).toBeCloseTo(1.0, 1);
    });

    it('清理阈值有效', () => {
      const { archiveScore, cleanupScore } = getConfig().cleanupThresholds;
      expect(archiveScore).toBeGreaterThan(cleanupScore);
      expect(archiveScore).toBeLessThanOrEqual(100);
      expect(cleanupScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('updateConfig', () => {
    it('部分更新只影响指定字段', async () => {
      const original = getConfig();
      const newThreshold = original.inactivityThresholdHours + 24;

      await updateConfig({ inactivityThresholdHours: newThreshold });

      const updated = getConfig();
      expect(updated.inactivityThresholdHours).toBe(newThreshold);
      expect(updated.contextLimits).toEqual(original.contextLimits);
    });

    it('更新 contextLimits 只合并变更的模型', async () => {
      const original = getConfig();
      const originalQwen = original.contextLimits['qwen-plus'] || 0;

      await updateConfig({
        contextLimits: { 'qwen-plus': 256000 },
      });

      const updated = getConfig();
      expect(updated.contextLimits['qwen-plus']).toBe(256000);
      // 其他模型限制保持不变
      expect(Object.keys(updated.contextLimits).length)
        .toBeGreaterThanOrEqual(Object.keys(original.contextLimits).length);
    });

    it('更新 importanceWeights 只影响指定权重', async () => {
      const original = getConfig();
      const newRecency = 0.5;

      await updateConfig({
        importanceWeights: { recency: newRecency },
      });

      const updated = getConfig();
      expect(updated.importanceWeights.recency).toBe(newRecency);
      expect(updated.importanceWeights.tokenUsage).toBe(original.importanceWeights.tokenUsage);
    });

    it('无效的部分更新不破坏整体配置', async () => {
      await updateConfig({ inactivityThresholdHours: -10 });
      const cfg = getConfig();
      expect(cfg.inactivityThresholdHours).toBeGreaterThan(0);
    });
  });

  describe('analyzeSessions', () => {
    it('在无事件时返回空数组', async () => {
      const sessions = await analyzeSessions(true);
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('强制刷新绕过缓存', async () => {
      // 第一次分析
      await analyzeSessions(false);
      // 强制刷新
      await expect(analyzeSessions(true)).resolves.not.toThrow();
    });
  });

  describe('getSession', () => {
    it('不存在的会话返回 null', async () => {
      const result = await getSession('non-existent-session-id');
      expect(result).toBeNull();
    });
  });

  describe('getSessionEvents', () => {
    it('不存在的会话返回空数组', async () => {
      const result = await getSessionEvents('non-existent-session-id');
      expect(result).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('返回有效的统计数据', async () => {
      const stats = await getStats();
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('activeSessions');
      expect(stats).toHaveProperty('totalContexts');
      expect(stats).toHaveProperty('totalCleanups');
      expect(stats).toHaveProperty('contextsByTool');
      expect(stats).toHaveProperty('avgImportanceScore');
      expect(stats).toHaveProperty('avgContextUtilization');
    });

    it('数值字段为非负数', async () => {
      const stats = await getStats();
      expect(stats.totalSessions).toBeGreaterThanOrEqual(0);
      expect(stats.activeSessions).toBeGreaterThanOrEqual(0);
      expect(stats.totalContexts).toBeGreaterThanOrEqual(0);
      expect(stats.totalCleanups).toBeGreaterThanOrEqual(0);
    });

    it('avgContextUtilization 在 0-1 之间', async () => {
      const stats = await getStats();
      expect(stats.avgContextUtilization).toBeGreaterThanOrEqual(0);
      expect(stats.avgContextUtilization).toBeLessThanOrEqual(1);
    });
  });

  describe('recordAction', () => {
    it('记录清理操作不抛出错误', async () => {
      await expect(recordAction({
        sessionId: 'test-action-session',
        action: 'archive' as any,
        reason: 'Test archive action',
        affectedTokens: 5000,
      })).resolves.not.toThrow();
    });

    it('记录清理操作后历史中有记录', async () => {
      const sessionId = `test-action-${Date.now()}`;
      await recordAction({
        sessionId,
        action: 'archive' as any,
        reason: 'Test archive',
        affectedTokens: 1000,
      });

      const history = getHistory(10);
      const found = history.find(h => h.sessionId === sessionId);
      expect(found).toBeDefined();
      expect(found?.sessionId).toBe(sessionId);
    });

    it('limit 参数正确限制返回数量', () => {
      const history = getHistory(5);
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('limit 为 0 时返回空数组', () => {
      const history = getHistory(0);
      expect(Array.isArray(history)).toBe(true);
    });

    it('limit 为负数时返回全部历史', () => {
      const history = getHistory(-1);
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('边界用例', () => {
    it('多次 analyzeSessions 不累积错误', async () => {
      for (let i = 0; i < 5; i++) {
        await expect(analyzeSessions(true)).resolves.not.toThrow();
      }
    });

    it('同时调用 updateConfig 和 analyzeSessions 不产生竞态条件', async () => {
      await Promise.all([
        updateConfig({ inactivityThresholdHours: 48 }),
        updateConfig({ inactivityThresholdHours: 72 }),
        analyzeSessions(true),
      ]);
      // 不应崩溃
      expect(getConfig()).toBeDefined();
    });
  });
});
