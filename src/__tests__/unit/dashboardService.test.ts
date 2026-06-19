/**
 * DashboardService 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  getDashboardStats,
  getTokenTrend,
  getErrorDistribution,
  getToolUsageStats,
  getRecentSessions,
} from '@/server/services/dashboardService';

describe('DashboardService', () => {
  describe('getDashboardStats', () => {
    it('should return dashboard statistics', async () => {
      const stats = await getDashboardStats();

      expect(stats).toBeDefined();
      expect(stats.totalTokens).toBeGreaterThanOrEqual(0);
      expect(stats.totalRequests).toBeGreaterThanOrEqual(0);
      expect(stats.avgLatency).toBeGreaterThanOrEqual(0);
      expect(stats.errorRate).toBeGreaterThanOrEqual(0);
      expect(stats.totalCost).toBeGreaterThanOrEqual(0);
    });

    it('should have valid stat types', async () => {
      const stats = await getDashboardStats();

      expect(typeof stats.totalTokens).toBe('number');
      expect(typeof stats.totalRequests).toBe('number');
      expect(typeof stats.avgLatency).toBe('number');
      expect(typeof stats.errorRate).toBe('number');
      expect(typeof stats.totalCost).toBe('number');
    });
  });

  describe('getTokenTrend', () => {
    it('should return token trend data', async () => {
      const trend = await getTokenTrend(7);

      expect(trend).toBeDefined();
      expect(Array.isArray(trend)).toBe(true);
      expect(trend.length).toBeLessThanOrEqual(7);
    });

    it('should return trend with valid data points', async () => {
      const trend = await getTokenTrend(7);

      trend.forEach((point) => {
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('inputTokens');
        expect(point).toHaveProperty('outputTokens');
        expect(point).toHaveProperty('totalTokens');
        expect(point.totalTokens).toBe(point.inputTokens + point.outputTokens);
      });
    });

    it('should handle different day parameters', async () => {
      const trend3 = await getTokenTrend(3);
      const trend7 = await getTokenTrend(7);

      expect(trend3.length).toBeLessThanOrEqual(3);
      expect(trend7.length).toBeLessThanOrEqual(7);
    });
  });

  describe('getErrorDistribution', () => {
    it('should return error distribution data', async () => {
      const distribution = await getErrorDistribution();

      expect(distribution).toBeDefined();
      expect(Array.isArray(distribution)).toBe(true);
    });

    it('should have valid error types', async () => {
      const distribution = await getErrorDistribution();

      distribution.forEach((item) => {
        expect(item).toHaveProperty('errorType');
        expect(item).toHaveProperty('count');
        expect(item).toHaveProperty('percentage');
        expect(item.count).toBeGreaterThanOrEqual(0);
        expect(item.percentage).toBeGreaterThanOrEqual(0);
        expect(item.percentage).toBeLessThanOrEqual(100);
      });
    });

    it('should have percentages that sum to approximately 100', async () => {
      const distribution = await getErrorDistribution();
      const totalPercentage = distribution.reduce((sum, item) => sum + item.percentage, 0);

      expect(totalPercentage).toBeGreaterThan(90);
      expect(totalPercentage).toBeLessThan(110);
    });
  });

  describe('getToolUsageStats', () => {
    it('should return tool usage statistics', async () => {
      const stats = await getToolUsageStats();

      expect(stats).toBeDefined();
      expect(Array.isArray(stats)).toBe(true);
    });

    it('should have valid tool stats', async () => {
      const stats = await getToolUsageStats();

      stats.forEach((stat) => {
        expect(stat).toHaveProperty('tool');
        expect(stat).toHaveProperty('requestCount');
        expect(stat).toHaveProperty('totalTokens');
        expect(stat).toHaveProperty('avgLatency');
        expect(stat).toHaveProperty('errorRate');
        expect(stat.requestCount).toBeGreaterThanOrEqual(0);
        expect(stat.totalTokens).toBeGreaterThanOrEqual(0);
        expect(stat.avgLatency).toBeGreaterThanOrEqual(0);
        expect(stat.errorRate).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('getRecentSessions', () => {
    it('should return recent sessions', async () => {
      const sessions = await getRecentSessions(10);

      expect(sessions).toBeDefined();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeLessThanOrEqual(10);
    });
  });
});
