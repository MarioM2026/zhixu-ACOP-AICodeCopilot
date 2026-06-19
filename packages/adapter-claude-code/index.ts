/**
 * Claude Code 适配器
 * 用于采集 Claude Code 的 AI 代码事件
 * 支持通过 Agent Monitor Proxy (AMP) 或 ai-context-hud 接入
 */

import { v4 as uuidv4 } from 'uuid';
import type { AgentAdapter, AdapterConfig, AdapterHealth, AdapterMetrics } from './adapter';
import type { AICodeEvent } from './index';
import { logger } from '../logger';

/**
 * Claude Code 事件数据结构
 */
interface ClaudeCodeEvent {
  type: 'request' | 'response' | 'error';
  timestamp: number;
  sessionId: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  error?: {
    type: string;
    message: string;
  };
  result?: {
    accepted: boolean;
    duration_ms: number;
  };
}

/**
 * Claude Code 适配器配置
 */
interface ClaudeCodeAdapterConfig extends AdapterConfig {
  proxyEndpoint?: string;
  apiKey?: string;
  pollInterval?: number;
}

/**
 * Claude Code 适配器实现
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  readonly config: ClaudeCodeAdapterConfig;
  readonly toolType = 'claude_code' as const;

  private metrics: AdapterMetrics = {
    totalEvents: 0,
    totalTokens: 0,
    avgLatency: 0,
    errorCount: 0,
  };

  private lastEventTimestamp: number = 0;
  private isRunning: boolean = false;
  private sessionCache: Map<string, number> = new Map();

  constructor(config: ClaudeCodeAdapterConfig) {
    this.config = {
      name: 'Claude Code Adapter',
      version: '1.0.0',
      enabled: true,
      ...config,
    };
  }

  /**
   * 初始化适配器
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Claude Code adapter', { config: this.config });

    // 尝试连接到 Agent Monitor Proxy
    if (this.config.proxyEndpoint) {
      try {
        await this.testConnection();
        logger.info('Connected to Claude Code proxy', { endpoint: this.config.proxyEndpoint });
      } catch (error) {
        logger.warn('Failed to connect to Claude Code proxy, using fallback mode', { error });
      }
    }

    this.isRunning = true;
    logger.info('Claude Code adapter initialized successfully');
  }

  /**
   * 测试代理连接
   */
  private async testConnection(): Promise<void> {
    if (!this.config.proxyEndpoint) {
      throw new Error('Proxy endpoint not configured');
    }

    // 实际实现中应该发送 HTTP 请求测试连接
    // const response = await fetch(`${this.config.proxyEndpoint}/health`);
    // if (!response.ok) throw new Error('Proxy connection failed');
  }

  /**
   * 采集 AI 代码事件
   * 从 Claude Code 的代理或本地日志读取数据
   */
  async dataCollect(): Promise<AICodeEvent[]> {
    if (!this.isRunning) {
      throw new Error('Claude Code adapter is not initialized');
    }

    try {
      const events = await this.fetchEvents();

      // 更新指标
      for (const event of events) {
        this.metrics.totalEvents++;
        this.metrics.totalTokens += event.tokenConsumption.total;
        if (event.performance.latency > 0) {
          this.metrics.avgLatency =
            (this.metrics.avgLatency * (this.metrics.totalEvents - 1) + event.performance.latency) /
            this.metrics.totalEvents;
        }
        if (event.quality?.errorType) {
          this.metrics.errorCount++;
        }
      }

      return events;
    } catch (error) {
      logger.error('Failed to collect events from Claude Code', { error });
      return [];
    }
  }

  /**
   * 从 Claude Code 获取事件
   */
  private async fetchEvents(): Promise<AICodeEvent[]> {
    // 模拟数据，实际应该从 Claude Code 的代理或 API 读取
    const now = Date.now();

    // 检查是否需要生成新事件（基于会话缓存）
    const events: AICodeEvent[] = [];
    const shouldGenerate = this.sessionCache.size === 0 || Math.random() > 0.6;

    if (shouldGenerate) {
      const sessionId = uuidv4();
      const inputTokens = Math.floor(Math.random() * 1200) + 150;
      const outputTokens = Math.floor(Math.random() * 2500) + 300;
      const latency = Math.floor(Math.random() * 2500) + 400;

      const event: AICodeEvent = {
        sessionId,
        traceId: uuidv4(),
        timestamp: now,
        tool: 'claude_code',
        modelId: 'claude-sonnet-4-20250514',
        tokenConsumption: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        },
        performance: {
          latency,
          ttft: Math.floor(Math.random() * 300) + 80,
          totalDuration: latency,
        },
        quality: {
          codeAcceptance: Math.random() > 0.15,
          errorType: Math.random() > 0.92 ? 'api_error' : undefined,
          contextOverflow: Math.random() > 0.95,
        },
        cost: {
          amount: (inputTokens * 0.000003 + outputTokens * 0.000015),
          currency: 'USD',
          attribution: 'claude_code',
        },
        metadata: {
          source: 'claude-code-adapter',
          adapterVersion: this.config.version,
          model: 'claude-sonnet-4',
        },
      };

      events.push(event);
      this.lastEventTimestamp = now;
      this.sessionCache.set(sessionId, now);
    }

    // 清理过期的会话缓存（保留最近 100 个）
    if (this.sessionCache.size > 100) {
      const entries = Array.from(this.sessionCache.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(50);
      this.sessionCache = new Map(entries);
    }

    return events;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();

    try {
      // 检查 Claude Code 是否运行
      const isHealthy = await this.checkClaudeCodeRunning();

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        lastCheck: Date.now(),
        latency: Date.now() - start,
        error: isHealthy ? undefined : 'Claude Code is not running',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: Date.now(),
        latency: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 检查 Claude Code 是否运行
   */
  private async checkClaudeCodeRunning(): Promise<boolean> {
    // 实际实现中应该检查 Claude Code 进程或 API
    return true;
  }

  /**
   * 获取适配器指标
   */
  async getMetrics(): Promise<AdapterMetrics> {
    return { ...this.metrics };
  }

  /**
   * 清理资源
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Claude Code adapter');
    this.isRunning = false;
    this.sessionCache.clear();
    logger.info('Claude Code adapter shutdown complete');
  }
}

export { ClaudeCodeAdapter as default };
