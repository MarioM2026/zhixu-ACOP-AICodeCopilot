import { v4 as uuidv4 } from 'uuid';
import type { Rule, MetricData, Alert } from '@zhixu/shared/types';
import { logger } from './logger';
import { getRecentEvents } from './aiCodeEventService';

// 内存存储（开发环境使用）
const rules: Map<string, Rule> = new Map();
const alerts: Map<string, Alert> = new Map();

// 初始化默认规则
const defaultRules: Rule[] = [
  {
    id: 'rule-001',
    name: '上下文清理预警',
    description: '当 Token 使用超过 80% 时触发',
    enabled: true,
    condition: {
      type: 'token_threshold',
      threshold: 0.8,
      operator: '>',
    },
    action: {
      type: 'clear_context',
      config: { message: '上下文即将溢出，建议清理' },
    },
    priority: 'high',
  },
  {
    id: 'rule-002',
    name: 'Token 超预算告警',
    description: '单日 Token 消耗超过阈值时发送告警',
    enabled: true,
    condition: {
      type: 'token_threshold',
      threshold: 100000,
      operator: '>',
    },
    action: {
      type: 'send_alert',
      config: { channels: ['dingtalk', 'email'], threshold: 100000 },
    },
    priority: 'medium',
  },
  {
    id: 'rule-003',
    name: '错误率过高告警',
    description: '当错误率超过 5% 时触发',
    enabled: true,
    condition: {
      type: 'error_rate',
      threshold: 5,
      operator: '>',
    },
    action: {
      type: 'send_alert',
      config: { channels: ['dingtalk'], severity: 'warning' },
    },
    priority: 'medium',
  },
  {
    id: 'rule-004',
    name: '延迟过高告警',
    description: '当平均延迟超过 5000ms 时触发',
    enabled: true,
    condition: {
      type: 'latency_threshold',
      threshold: 5000,
      operator: '>',
    },
    action: {
      type: 'send_alert',
      config: { channels: ['dingtalk'], severity: 'info' },
    },
    priority: 'low',
  },
];

// 初始化默认规则
defaultRules.forEach((rule) => rules.set(rule.id, rule));

// 获取所有规则
export async function getRules(): Promise<Rule[]> {
  return Array.from(rules.values());
}

// 获取单个规则
export async function getRuleById(id: string): Promise<Rule | null> {
  return rules.get(id) || null;
}

// 创建规则
export async function createRule(rule: Rule): Promise<Rule> {
  const newRule: Rule = {
    ...rule,
    id: rule.id || uuidv4(),
  };
  rules.set(newRule.id, newRule);
  logger.info(`Rule created: ${newRule.id}`, { name: newRule.name });
  return newRule;
}

// 更新规则
export async function updateRule(id: string, rule: Rule): Promise<Rule | null> {
  if (!rules.has(id)) {
    return null;
  }
  const updatedRule = { ...rule, id };
  rules.set(id, updatedRule);
  logger.info(`Rule updated: ${id}`, { name: rule.name });
  return updatedRule;
}

// 删除规则
export async function deleteRule(id: string): Promise<void> {
  rules.delete(id);
  logger.info(`Rule deleted: ${id}`);
}

// 触发规则
export async function triggerRule(id: string): Promise<void> {
  const rule = rules.get(id);
  if (!rule) {
    throw new Error(`Rule not found: ${id}`);
  }

  // 获取最近的事件数据用于评估
  const events = await getRecentEvents(100);
  const metricData = evaluateEvents(events);

  // 检查条件是否满足
  if (evaluateCondition(rule, metricData)) {
    await executeAction(rule);
  }
}

// 评估事件数据
function evaluateEvents(events: any[]): MetricData {
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;

  // 计算最近一小时的数据
  const recentEvents = events.filter((e) => now - e.timestamp < oneHourMs);

  const totalTokens = recentEvents.reduce((sum, e) => sum + (e.tokenConsumption?.total || 0), 0);
  const errorCount = recentEvents.filter((e) => e.quality?.errorType).length;
  const totalLatency = recentEvents.reduce((sum, e) => sum + (e.performance?.latency || 0), 0);

  return {
    sessionId: 'current',
    timestamp: now,
    tool: 'trae',
    metrics: {
      tokenUsage: totalTokens,
      tokenLimit: 200000,
      errorRate: recentEvents.length > 0 ? (errorCount / recentEvents.length) * 100 : 0,
      avgLatency: recentEvents.length > 0 ? totalLatency / recentEvents.length : 0,
      requestCount: recentEvents.length,
    },
  };
}

// 评估条件
function evaluateCondition(rule: Rule, data: MetricData): boolean {
  const { condition } = rule;
  const value =
    condition.type === 'token_threshold'
      ? data.metrics.tokenUsage / data.metrics.tokenLimit
      : condition.type === 'error_rate'
        ? data.metrics.errorRate
        : condition.type === 'latency_threshold'
          ? data.metrics.avgLatency
          : 0;

  switch (condition.operator) {
    case '>':
      return value > condition.threshold;
    case '<':
      return value < condition.threshold;
    case '>=':
      return value >= condition.threshold;
    case '<=':
      return value <= condition.threshold;
    case '==':
      return value === condition.threshold;
    default:
      return false;
  }
}

// 执行动作
async function executeAction(rule: Rule): Promise<void> {
  const alert: Alert = {
    id: uuidv4(),
    ruleId: rule.id,
    severity:
      rule.priority === 'high' ? 'critical' : rule.priority === 'medium' ? 'warning' : 'info',
    title: `规则触发: ${rule.name}`,
    message: `规则 "${rule.name}" 的条件已满足，执行动作: ${rule.action.type}`,
    timestamp: Date.now(),
    acknowledged: false,
  };

  alerts.set(alert.id, alert);
  logger.info(`Alert generated: ${alert.id}`, { ruleId: rule.id, action: rule.action.type });

  // TODO: 根据 action.type 执行实际动作
  // - clear_context: 调用工具 API 清理上下文
  // - send_alert: 发送通知到钉钉/邮件
  // - inject_prompt: 注入提示词
  // - route_model: 切换模型
}

// 获取告警列表
export async function getAlerts(): Promise<Alert[]> {
  return Array.from(alerts.values()).sort((a, b) => b.timestamp - a.timestamp);
}

// 确认告警
export async function acknowledgeAlert(id: string): Promise<void> {
  const alert = alerts.get(id);
  if (alert) {
    alert.acknowledged = true;
    alerts.set(id, alert);
  }
}
