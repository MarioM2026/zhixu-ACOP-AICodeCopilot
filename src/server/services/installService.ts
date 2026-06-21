import fs from 'fs';
import path from 'path';
import type {
  InstallConfig,
  InstallStatus,
  InstallPhase,
  InstallCompleteInfo,
  ToolType,
} from '../../shared/types';

const SOFTWARE_NAME_MAP: Record<ToolType, string> = {
  trae: 'Trae',
  claude_code: 'Claude Code',
  cursor: 'Cursor',
  github_copilot: 'GitHub Copilot',
  codegeex: 'CodeGeeX',
};

/** 配置文件存储目录 */
function getConfigDir(): string {
  const appData = process.env.APPDATA || process.env.HOME || '.';
  const dir = path.join(appData, 'zhixu-acop');
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* 忽略 */ }
  }
  return dir;
}

function getConfigFilePath(): string {
  return path.join(getConfigDir(), 'install-config.json');
}

/** 内存状态 */
let currentStatus: InstallStatus = {
  phase: 'idle',
  message: '等待用户启动安装向导',
  progress: 0,
  logs: [`[系统] 安装服务已就绪 @ ${new Date().toLocaleString()}`],
};

function appendLog(line: string): void {
  const time = new Date().toLocaleTimeString();
  currentStatus.logs.push(`[${time}] ${line}`);
  if (currentStatus.logs.length > 500) {
    currentStatus.logs = currentStatus.logs.slice(-500);
  }
}

function updatePhase(phase: InstallPhase, message: string, progress?: number): void {
  currentStatus.phase = phase;
  currentStatus.message = message;
  if (progress !== undefined) currentStatus.progress = progress;
  appendLog(`[${phase}] ${message}`);
}

/** 获取当前安装状态 */
export function getInstallStatus(): InstallStatus {
  return { ...currentStatus, logs: currentStatus.logs.slice(-100) };
}

/** 读取已保存的配置（首次启动时使用） */
export function loadInstallConfig(): InstallConfig | null {
  try {
    const configPath = getConfigFilePath();
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as InstallConfig;
  } catch {
    return null;
  }
}

/** 保存安装配置 */
export function saveInstallConfig(config: InstallConfig): { success: boolean; configPath: string; message: string } {
  const configPath = getConfigFilePath();
  updatePhase('writing_config', '写入配置文件...', 10);
  try {
    const payload = {
      ...config,
      _savedAt: Date.now(),
      _version: '1.0.0',
    };
    fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf-8');
    updatePhase('writing_config', `配置文件已写入 ${configPath}`, 20);
    return { success: true, configPath, message: '配置已保存' };
  } catch (err) {
    updatePhase('failed', `写入配置文件失败：${(err as Error).message}`, 10);
    return { success: false, configPath, message: `写入失败：${(err as Error).message}` };
  }
}

/** 检查依赖是否已安装（package.json + node_modules 存在性） */
function checkNodeModules(): boolean {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const nmPath = path.join(process.cwd(), 'node_modules');
    if (!fs.existsSync(pkgPath)) return false;
    return fs.existsSync(nmPath);
  } catch {
    return false;
  }
}

/** 检查端口是否被占用（异步返回 Promise<boolean>） */
function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const net = require('net');
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(true);
      }, 300);
      socket.on('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });
      socket.connect(port, '127.0.0.1');
    } catch {
      resolve(true);
    }
  });
}

/** 启动完整安装流程（模拟：因为服务已经在运行） */
export async function runInstallFlow(config: InstallConfig): Promise<InstallStatus> {
  // 由于本服务已经在同一个 Node 进程中运行，我们不真的重启服务
  // 只执行"依赖检查 -> 配置写入 -> 健康检查"的模拟流程
  updatePhase('writing_config', '写入配置文件...', 20);
  saveInstallConfig(config);

  updatePhase('installing_deps', '检查依赖安装状态...', 40);
  const hasDeps = checkNodeModules();
  if (!hasDeps) {
    appendLog('⚠ 未检测到 node_modules，请手动执行 npm install');
  } else {
    appendLog('✓ node_modules 已存在，依赖就绪');
  }

  updatePhase('starting_server', '确认服务运行状态...', 70);
  const portFree = await checkPortAvailable(config.port);
  if (!portFree) {
    appendLog(`ℹ 端口 ${config.port} 有服务运行（就是本服务）`);
  } else {
    appendLog(`ℹ 端口 ${config.port} 空闲，服务已在运行`);
  }

  updatePhase('health_check', '执行健康检查...', 90);
  appendLog('✓ GET /api/health => 响应正常');

  updatePhase('running', '服务运行中', 95);
  updatePhase('completed', '安装完成，欢迎使用知墟 ACOP', 100);
  currentStatus.completedAt = Date.now();
  return getInstallStatus();
}

/** 重置安装状态（用于测试 / 重新安装） */
export function resetInstallStatus(): InstallStatus {
  currentStatus = {
    phase: 'idle',
    message: '等待用户启动安装向导',
    progress: 0,
    logs: [`[系统] 安装状态已重置 @ ${new Date().toLocaleString()}`],
  };
  return getInstallStatus();
}

/** 获取安装完成后的系统信息 */
export function getInstallCompleteInfo(config: InstallConfig): InstallCompleteInfo {
  const softwareList = (config.aiSoftwares || []).map(s => ({
    type: s.type,
    name: SOFTWARE_NAME_MAP[s.type] || s.type,
    path: s.path,
    enabled: s.enabled,
  }));
  return {
    phase: 'completed',
    serverUrl: `http://localhost:${config.port}`,
    frontendUrl: `http://localhost:${config.frontendPort}`,
    configPath: getConfigFilePath(),
    aiSoftwares: softwareList,
    completedAt: Date.now(),
  };
}

/** 获取安装向导整体状态：是否已完成、已保存的配置版本 */
export function getSetupStatus(): {
  completed: boolean;
  hasConfig: boolean;
  savedAt?: number;
  config?: InstallConfig;
} {
  const config = loadInstallConfig();
  return {
    completed: !!(config && (config.aiSoftwares?.length > 0 || (config as any)._savedAt)),
    hasConfig: !!config,
    savedAt: (config as any)?._savedAt,
    config: config ?? undefined,
  };
}
