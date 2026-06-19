/**
 * RuleService 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getRules, getRuleById, createRule, updateRule, deleteRule } from '@/server/services/ruleService';
import type { Rule } from '@zhixu/shared/types';

describe('RuleService', () => {
  const mockRule: Rule = {
    id: 'test-rule-1',
    name: '测试规则',
    description: '这是一个测试规则',
    enabled: true,
    condition: {
      type: 'token_threshold',
      threshold: 0.8,
      operator: '>',
    },
    action: {
      type: 'send_alert',
      config: { channels: ['console'] },
    },
    priority: 'medium',
  };

  describe('getRules', () => {
    it('should return all rules', async () => {
      const rules = await getRules();

      expect(rules).toBeDefined();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should include default rules', async () => {
      const rules = await getRules();

      const defaultRuleNames = ['上下文清理预警', 'Token 超预算告警', '错误率过高告警'];
      const ruleNames = rules.map((r) => r.name);

      defaultRuleNames.forEach((name) => {
        expect(ruleNames).toContain(name);
      });
    });
  });

  describe('getRuleById', () => {
    it('should return rule by id', async () => {
      const rules = await getRules();
      const firstRule = rules[0];

      if (firstRule) {
        const result = await getRuleById(firstRule.id);
        expect(result).toBeDefined();
        expect(result?.id).toBe(firstRule.id);
      }
    });

    it('should return null for non-existent rule', async () => {
      const result = await getRuleById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('createRule', () => {
    it('should create a new rule', async () => {
      const newRule: Rule = {
        ...mockRule,
        id: 'new-rule-' + Date.now(),
        name: '新建规则-' + Date.now(),
      };

      const result = await createRule(newRule);

      expect(result).toBeDefined();
      expect(result.name).toBe(newRule.name);
      expect(result.id).toBe(newRule.id);
    });

    it('should generate id if not provided', async () => {
      const ruleWithoutId: Rule = {
        ...mockRule,
        id: undefined as unknown as string,
        name: '无ID规则-' + Date.now(),
      };

      const result = await createRule(ruleWithoutId);

      expect(result.id).toBeDefined();
    });
  });

  describe('updateRule', () => {
    it('should update an existing rule', async () => {
      const rules = await getRules();
      const ruleToUpdate = rules[0];

      if (ruleToUpdate) {
        const updatedRule = {
          ...ruleToUpdate,
          name: ruleToUpdate.name + ' (已更新)',
          enabled: !ruleToUpdate.enabled,
        };

        const result = await updateRule(ruleToUpdate.id, updatedRule);

        expect(result).toBeDefined();
        expect(result?.name).toBe(updatedRule.name);
      }
    });

    it('should return null for non-existent rule', async () => {
      const result = await updateRule('non-existent-id', mockRule);
      expect(result).toBeNull();
    });
  });

  describe('deleteRule', () => {
    it('should not throw when deleting non-existent rule', async () => {
      await expect(deleteRule('non-existent-id')).resolves.not.toThrow();
    });
  });
});
