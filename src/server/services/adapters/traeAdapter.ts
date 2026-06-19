import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import type { AICodeEvent, ToolType } from '@zhixu/shared/types';
import type { AdapterConfig, AdapterHealth, AdapterMetrics, AgentAdapter } from '../adapterService';
import { logger } from '../logger';
import { findExistingDir, scanDirectoryForEvents } from './adapterUtils';

export interface TraeAdapterConfig extends AdapterConfig {
  mode?: 'manual' | 'auto';
  logPath?: string;
  extraLogPaths?: string[];
}

const DEFAULT_MODEL = 'qwen-plus';

function getStateDir(): string {
  const dir = process.env.TRAE_STATE_DIR ||
    path.join(process.env.APPDATA || process.env.HOME || process.cwd(), 'zhixu-acop-state');
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  }
  return dir;
}

function getStateFile(): string {
  return path.join(getStateDir(), 'trae-adapter-state.json');
}

interface PersistedState {
  processedFileMap: Record<string, number>;
  metrics: AdapterMetrics;
  savedAt: number;
}

function loadPersistedState(): PersistedState | null {
  try {
    const file = getStateFile();
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return data;
  } catch {
    return null;
  }
}

function savePersistedState(state: PersistedState): void {
  try {
    state.savedAt = Date.now();
    fs.writeFileSync(getStateFile(), JSON.stringify(state, null, 2), 'utf-8');
  } catch {}
}

export class TraeAdapter implements AgentAdapter {
  readonly toolType: ToolType = 'trae';
  config: TraeAdapterConfig & { mode: 'manual' | 'auto' };

  private metrics: AdapterMetrics = { totalEvents: 0, totalTokens: 0, avgLatency: 0, errorCount: 0 };
  private running: boolean = false;
  private pendingEvents: AICodeEvent[] = [];
  private processedFileMap: Record<string, number> = {};
  private lastDetectedPath: string | null = null;

  constructor(config: TraeAdapterConfig) {
    this.config = {
      ...config,
      name: config.name || 'Trae 适配器',
      version: config.version || '1.2.0',
      enabled: config.enabled !== undefined ? config.enabled : true,
      mode: config.mode || 'auto',
    };
  }

  setMode(mode: 'manual' | 'auto'): void {
    this.config.mode = mode;
    logger.info(`[TraeAdapter] 模式切换为 ${mode}`);
  }

  setLogPath(newPath: string): void {
    const oldPath = this.config.logPath;
    this.config.logPath = newPath;

    // 路径变更时，重置已处理文件映射（避免旧目录的历史数据污染新目录）
    if (oldPath !== newPath) {
      this.processedFileMap = {};
      // 预先扫描新目录的现有文件，将其大小记录到 map 中
      // 避免第一次扫描就把整个历史日志重新解析成事件
      if (newPath && fs.existsSync(newPath)) {
        try {
          const existingFiles: string[] = [];
          const scanSubDirs = (currentDir: string, depth: number) => {
            if (depth > 4) return;
            const entries = fs.readdirSync(currentDir);
            for (const entry of entries) {
              const fullPath = path.join(currentDir, entry);
              try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                  scanSubDirs(fullPath, depth + 1);
                } else if (entry.endsWith('.log')) {
                  existingFiles.push(fullPath);
                }
              } catch {}
            }
          };
          scanSubDirs(newPath, 0);
          existingFiles.forEach((f) => {
            try { this.processedFileMap[f] = fs.statSync(f).size; } catch {}
          });
          logger.info('[TraeAdapter] 路径已更新，预扫描现有文件', {
            newPath,
            existingLogFiles: existingFiles.length,
          });
        } catch (error) {
          logger.error('[TraeAdapter] 路径预扫描失败', { error: String(error) });
        }
      }
    }
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  getDetectedPath(): string | null {
    return this.lastDetectedPath;
  }

  getCandidatePaths(): string[] {
    const candidates: string[] = [];
    if (process.platform === 'win32') {
      candidates.push('%APPDATA%/Trae/User/trae');
      candidates.push('%APPDATA%/Trae/trae');
      candidates.push('%USERPROFILE%/.trae');
      candidates.push('%APPDATA%/Code/User/globalStorage/trae.trae');
      candidates.push('%APPDATA%/Code/User/globalStorage/alibabapublic.tongyi-lingma');
      candidates.push('%LOCALAPPDATA%/Trae');
    } else if (process.platform === 'darwin') {
      candidates.push('~/Library/Application Support/Trae');
      candidates.push('~/.trae');
      candidates.push('~/Library/Application Support/Code/User/globalStorage/trae.trae');
    } else {
      candidates.push('~/.config/Trae');
      candidates.push('~/.trae');
      candidates.push('~/.config/Code/User/globalStorage/trae.trae');
    }
    if (this.config.extraLogPaths) {
      candidates.unshift(...this.config.extraLogPaths);
    }
    return candidates;
  }

  async initialize(): Promise<void> {
    logger.info('[TraeAdapter] 初始化中', { mode: this.config.mode });
    this.running = true;

    // 从磁盘恢复状态，防止重启后重复扫描
    const persisted = loadPersistedState();
    if (persisted) {
      this.processedFileMap = persisted.processedFileMap || {};
      this.metrics = persisted.metrics || this.metrics;
      const saved = new Date(persisted.savedAt).toLocaleString();
      logger.info('[TraeAdapter] 已从磁盘恢复状态', {
        rememberedFiles: Object.keys(this.processedFileMap).length,
        savedAt: saved,
        totalTokens: this.metrics.totalTokens,
        totalEvents: this.metrics.totalEvents,
      });
    } else {
      // 新安装：预先扫描目录结构，将现有文件大小记录到 map 中，
      // 避免第一次扫描就把整个历史日志解析成事件导致 tokens 溢出
      if (this.config.mode === 'auto') {
        const dir = this.resolveLogPath();
        if (dir) {
          try {
            const existingFiles: string[] = [];
            const scanSubDirs = (currentDir: string, depth: number) => {
              if (depth > 4) return;
              const entries = fs.readdirSync(currentDir);
              for (const entry of entries) {
                const fullPath = path.join(currentDir, entry);
                try {
                  const stat = fs.statSync(fullPath);
                  if (stat.isDirectory()) {
                    scanSubDirs(fullPath, depth + 1);
                  } else if (entry.endsWith('.log')) {
                    existingFiles.push(fullPath);
                  }
                } catch {}
              }
            };
            scanSubDirs(dir, 0);
            existingFiles.forEach((f) => {
              try { this.processedFileMap[f] = fs.statSync(f).size; } catch {}
            });
            logger.info('[TraeAdapter] 首次初始化：已记录现有日志文件', {
              existingLogFiles: existingFiles.length,
              note: '后续只扫描新增内容',
            });
          } catch {}
        }
      }
    }

    if (this.config.mode === 'auto') {
      this.lastDetectedPath = this.resolveLogPath();
      logger.info('[TraeAdapter] 自动模式已启用', { logPath: this.lastDetectedPath || '未检测到' });
    }
  }

  async dataCollect(): Promise<AICodeEvent[]> {
    if (!this.running) return [];
    try {
      let events: AICodeEvent[] = [];

      if (this.config.mode === 'auto') {
        const dir = this.resolveLogPath();
        if (dir) {
          this.lastDetectedPath = dir;
          const scanned = scanDirectoryForEvents(dir, 'trae', DEFAULT_MODEL, this.processedFileMap, 30);
          if (scanned.length > 0) {
            logger.info(`[TraeAdapter] 从日志扫描到 ${scanned.length} 个事件`, { dir });
          }
          events = scanned;
        }
      }

      if (this.pendingEvents.length > 0) {
        events = [...events, ...this.pendingEvents];
        this.pendingEvents = [];
      }

      events.forEach((e) => this.updateMetrics(e));

      // 持久化状态到磁盘，防止重启后重复扫描
      if (events.length > 0 || Object.keys(this.processedFileMap).length > 0) {
        savePersistedState({
          processedFileMap: this.processedFileMap,
          metrics: this.metrics,
          savedAt: Date.now(),
        });
      }

      return events;
    } catch (error) {
      logger.error('[TraeAdapter] 采集失败', { error: String(error) });
      return [];
    }
  }

  submitManualEvent(partialEvent: Partial<AICodeEvent> & {
    sessionId: string;
    modelId: string;
    tokenConsumption: { input: number; output: number; total?: number };
  }): AICodeEvent {
    const fullEvent: AICodeEvent = {
      id: uuidv4(),
      sessionId: partialEvent.sessionId,
      traceId: partialEvent.traceId || uuidv4(),
      timestamp: partialEvent.timestamp || Date.now(),
      tool: 'trae',
      modelId: partialEvent.modelId || DEFAULT_MODEL,
      tokenConsumption: {
        input: partialEvent.tokenConsumption.input,
        output: partialEvent.tokenConsumption.output,
        total: partialEvent.tokenConsumption.total ||
          partialEvent.tokenConsumption.input + partialEvent.tokenConsumption.output,
      },
      performance: partialEvent.performance || { latency: 2000, ttft: 500 },
      quality: partialEvent.quality,
    };
    this.pendingEvents.push(fullEvent);
    return fullEvent;
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      const logDir = this.resolveLogPath();
      return {
        status: this.running ? 'healthy' : 'degraded',
        lastCheck: start,
        latency: Date.now() - start,
        error: this.config.mode === 'auto' && !logDir ? '未检测到可用日志目录' : undefined,
      };
    } catch (error) {
      return { status: 'unhealthy', lastCheck: Date.now(), error: String(error) };
    }
  }

  async getMetrics(): Promise<AdapterMetrics> {
    return { ...this.metrics };
  }

  async shutdown(): Promise<void> {
    this.running = false;
    this.pendingEvents = [];
    logger.info('[TraeAdapter] 已停止');
  }

  private updateMetrics(e: AICodeEvent): void {
    this.metrics.totalEvents++;
    this.metrics.totalTokens += e.tokenConsumption.total;
    if (e.performance?.latency) {
      this.metrics.avgLatency =
        (this.metrics.avgLatency * (this.metrics.totalEvents - 1) + e.performance.latency) /
        this.metrics.totalEvents;
    }
    if (e.quality?.errorType) this.metrics.errorCount++;
  }

  private resolveLogPath(): string | null {
    if (this.config.logPath) return this.config.logPath;
    return findExistingDir(this.getCandidatePaths());
  }
}

export { TraeAdapter as default };
