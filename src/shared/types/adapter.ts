/**
 * Agent 适配器接口定义
 * 所有 AI 编程工具适配器都必须实现此接口
 */

import type { AICodeEvent, ToolType } from '@zhixu/shared/types';

/**
 * 适配器配置
 */
export interface AdapterConfig {
  name: string;
  version: string;
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
}

/**
 * 适配器健康状态
 */
export interface AdapterHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  latency?: number;
  error?: string;
}

/**
 * 适配器指标
 */
export interface AdapterMetrics {
  totalEvents: number;
  totalTokens: number;
  avgLatency: number;
  errorCount: number;
}

/**
 * Agent 适配器接口
 */
export interface AgentAdapter {
  // 适配器信息
  readonly config: AdapterConfig;
  readonly toolType: ToolType;

  /**
   * 初始化适配器
   */
  initialize(): Promise<void>;

  /**
   * 采集 AI 代码事件
   */
  dataCollect(): Promise<AICodeEvent[]>;

  /**
   * 获取适配器健康状态
   */
  healthCheck(): Promise<AdapterHealth>;

  /**
   * 获取适配器指标
   */
  getMetrics(): Promise<AdapterMetrics>;

  /**
   * 清理资源
   */
  shutdown(): Promise<void>;
}

/**
 * 适配器注册表
 */
export class AdapterRegistry {
  private adapters: Map<ToolType, AgentAdapter> = new Map();

  /**
   * 注册适配器
   */
  register(adapter: AgentAdapter): void {
    if (this.adapters.has(adapter.toolType)) {
      throw new Error(`Adapter for ${adapter.toolType} is already registered`);
    }
    this.adapters.set(adapter.toolType, adapter);
  }

  /**
   * 注销适配器
   */
  unregister(toolType: ToolType): void {
    this.adapters.delete(toolType);
  }

  /**
   * 获取适配器
   */
  get(toolType: ToolType): AgentAdapter | undefined {
    return this.adapters.get(toolType);
  }

  /**
   * 获取所有适配器
   */
  getAll(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 检查适配器是否存在
   */
  has(toolType: ToolType): boolean {
    return this.adapters.has(toolType);
  }
}

// 全局适配器注册表
export const adapterRegistry = new AdapterRegistry();
