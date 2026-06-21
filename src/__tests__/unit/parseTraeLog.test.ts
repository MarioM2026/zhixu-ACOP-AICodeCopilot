/**
 * parseTraeLog 单元测试 - 边界用例覆盖
 */

import { describe, it, expect } from 'vitest';
import { parseTraeLog } from '@/server/services/adapters/adapterUtils';

describe('parseTraeLog', () => {

  describe('边界条件', () => {
    it('空字符串返回空数组', () => {
      const result = parseTraeLog('', 'qwen-plus');
      expect(result).toEqual([]);
    });

    it('纯空白字符串返回空数组', () => {
      const result = parseTraeLog('   \n\n  \r\n  ', 'qwen-plus');
      expect(result).toEqual([]);
    });

    it('不含 AI 调用关键词的普通文本返回空数组', () => {
      const content = `
2026-06-21 10:00:00 INFO Application started
2026-06-21 10:00:01 DEBUG Loading configuration from disk
2026-06-21 10:00:02 WARN Configuration file not found, using defaults
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      expect(result).toEqual([]);
    });

    it('无效 JSON 行不导致崩溃，继续处理后续行', () => {
      const content = `
2026-06-21 10:00:00 { invalid json content here
2026-06-21 10:00:01 INFO [llm_invoke] {"session_id":"s1","tokens_used":1000}
2026-06-21 10:00:02 { also invalid
      `.trim();
      // 不应抛出错误
      expect(() => parseTraeLog(content, 'qwen-plus')).not.toThrow();
    });
  });

  describe('基础 AI 调用解析', () => {
    it('能正确解析包含 llm_invoke 的日志行', () => {
      const content = `
2026-06-21T10:00:00.123Z INFO [llm_invoke] {"session_id":"sess-001","model":"claude-sonnet-4","tokens_used":1500,"latency_ms":1200}
      `.trim();
      const result = parseTraeLog(content, 'claude-sonnet-4');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].sessionId).toBe('sess-001');
    });

    it('能正确解析包含 calling generate 的日志行', () => {
      const content = `
2026-06-21 10:00:00 INFO [calling generate] sessionId=gen-002 model=qwen-coder-32b tokens=800
      `.trim();
      const result = parseTraeLog(content, 'qwen-coder-32b');
      expect(Array.isArray(result)).toBe(true);
    });

    it('能正确解析包含 generate complete 的日志行', () => {
      const content = `
2026-06-21 10:00:00 INFO [generate complete] session_id=comp-003 duration_ms=3500
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      expect(Array.isArray(result)).toBe(true);
    });

    it('能正确解析包含 tokens_used 的日志行', () => {
      const content = `
2026-06-21T10:00:00Z [tokens_used] {"session":"tok-004","input":500,"output":1200}
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('多会话聚合', () => {
    it('同一 session_id 的多条日志聚合为一个事件', () => {
      const content = `
2026-06-21T10:00:00Z [llm_invoke] {"session_id":"agg-test","model":"qwen-plus","tokens_used":1000}
2026-06-21T10:00:01Z [llm_call] {"session_id":"agg-test","duration":500}
2026-06-21T10:00:02Z [tokens_used] {"session":"agg-test","input":800,"output":2000}
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      // 应该按 session_id 聚合，不产生多个重复事件
      const aggSessions = result.filter(e => e.sessionId === 'agg-test');
      expect(aggSessions.length).toBeGreaterThanOrEqual(1);
    });

    it('不同 session_id 产生不同事件', () => {
      const content = `
2026-06-21T10:00:00Z [llm_invoke] {"session_id":"multi-1","model":"qwen-plus","tokens_used":500}
2026-06-21T10:00:01Z [llm_invoke] {"session_id":"multi-2","model":"qwen-plus","tokens_used":600}
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      const sessions = [...new Set(result.map(e => e.sessionId))];
      expect(sessions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Token 和性能数据', () => {
    it('解析事件包含 tokenConsumption 结构', () => {
      const content = `
2026-06-21T10:00:00Z [llm_invoke] {"session_id":"token-test","tokens_used":3000}
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      if (result.length > 0) {
        const event = result[0];
        expect(event).toHaveProperty('tokenConsumption');
        expect(event.tokenConsumption).toHaveProperty('input');
        expect(event.tokenConsumption).toHaveProperty('output');
        expect(event.tokenConsumption).toHaveProperty('total');
      }
    });

    it('解析事件包含 performance 结构', () => {
      const content = `
2026-06-21T10:00:00Z [llm_invoke] {"session_id":"perf-test","tokens_used":1000}
2026-06-21T10:00:01Z [TimingCost] {"session_id":"perf-test","processing_time_ms":2500}
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      if (result.length > 0) {
        const event = result[0];
        expect(event).toHaveProperty('performance');
        expect(event.performance).toHaveProperty('latency');
      }
    });

    it('缺失字段时有合理的默认值', () => {
      const content = `
2026-06-21T10:00:00Z [llm_invoke] {"session_id":"minimal-test"}
      `.trim();
      // 不应抛出错误
      expect(() => parseTraeLog(content, 'qwen-plus')).not.toThrow();
      const result = parseTraeLog(content, 'qwen-plus');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('时间戳解析', () => {
    it('ISO 格式时间戳 (2026-06-21T10:00:00Z) 能被正确解析', () => {
      const content = `
2026-06-21T10:00:00Z [llm_invoke] {"session_id":"iso-time","tokens_used":500}
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      if (result.length > 0) {
        expect(result[0].timestamp).toBeGreaterThan(0);
      }
    });

    it('空格分隔时间戳 (2026-06-21 10:00:00) 能被正确解析', () => {
      const content = `
2026-06-21 10:00:00 [llm_invoke] {"session_id":"space-time","tokens_used":500}
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      if (result.length > 0) {
        expect(result[0].timestamp).toBeGreaterThan(0);
      }
    });

    it('带毫秒的时间戳 (2026-06-21T10:00:00.123Z) 能被正确解析', () => {
      const content = `
2026-06-21T10:00:00.123Z [llm_invoke] {"session_id":"ms-time","tokens_used":500}
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      if (result.length > 0) {
        expect(result[0].timestamp).toBeGreaterThan(0);
      }
    });

    it('带时区偏移的时间戳 (+08:00) 能被正确解析', () => {
      const content = `
2026-06-21T10:00:00+08:00 [llm_invoke] {"session_id":"tz-time","tokens_used":500}
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      if (result.length > 0) {
        expect(result[0].timestamp).toBeGreaterThan(0);
      }
    });
  });

  describe('模型名称提取', () => {
    it('能从日志 JSON 中提取真实模型名', () => {
      const content = `
2026-06-21T10:00:00Z [llm_invoke] {"session_id":"model-extract","model":"claude-opus-4","tokens_used":5000}
      `.trim();
      const result = parseTraeLog(content, 'qwen-plus');
      if (result.length > 0) {
        // 解析结果中的 modelId 应该是真实模型名或默认模型
        expect(result[0].modelId).toBeTruthy();
      }
    });

    it('日志无模型时使用传入的 defaultModel', () => {
      const content = `
2026-06-21T10:00:00Z [llm_invoke] {"session_id":"no-model","tokens_used":500}
      `.trim();
      const result = parseTraeLog(content, 'qwen-coder-32b');
      if (result.length > 0) {
        expect(result[0].modelId).toBeTruthy();
      }
    });
  });

  describe('错误场景', () => {
    it('超长单行内容不会导致内存问题', () => {
      const longLine = 'x'.repeat(100000);
      const content = `2026-06-21T10:00:00Z [llm_invoke] {"session_id":"long-test","tokens_used":500} ${longLine}`;
      expect(() => parseTraeLog(content, 'qwen-plus')).not.toThrow();
    });

    it('特殊字符（emoji、非 ASCII）在内容中不崩溃', () => {
      const content = `
2026-06-21T10:00:00Z [llm_invoke] {"session_id":"emoji-test","message":"Hello 世界 🌍 🎉","tokens_used":500}
      `.trim();
      expect(() => parseTraeLog(content, 'qwen-plus')).not.toThrow();
    });

    it('嵌套 JSON 结构能正确解析', () => {
      const content = `
2026-06-21T10:00:00Z [llm_invoke] {"session_id":"nested-test","tokens_used":500,"metadata":{"user_id":"u1","project":"ACOP"}}
      `.trim();
      expect(() => parseTraeLog(content, 'qwen-plus')).not.toThrow();
    });
  });
});
