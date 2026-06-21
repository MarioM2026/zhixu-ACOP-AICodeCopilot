import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import type { EnvSummary, EnvInfo } from '../../shared/types';

/** 安全地执行命令并返回 stdout 字符串 */
function safeExec(command: string, timeoutMs = 5000): string | null {
  try {
    const buffer = execSync(command, { timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!buffer) return null;
    return buffer.toString().trim();
  } catch (err) {
    return null;
  }
}

/** 解析 semver 版本（取首个数字序列） */
function parseVersion(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/v?(\d+(?:\.\d+){0,3})/);
  return m ? m[1] : undefined;
}

/** 比较两个语义版本（仅比较数字部分，返回 true 当 a >= b） */
function versionGte(a: string, b: string): boolean {
  const aParts = a.split('.').map(n => parseInt(n, 10));
  const bParts = b.split('.').map(n => parseInt(n, 10));
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const av = aParts[i] || 0;
    const bv = bParts[i] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

/** 查找可执行文件的路径 (Windows 使用 where, 其他使用 which) */
function findBinPath(binName: string): string | undefined {
  const cmd = process.platform === 'win32' ? `where ${binName}` : `which ${binName}`;
  return safeExec(cmd) || undefined;
}

/** 检测 Node.js */
export function detectNode(): EnvInfo {
  const version = parseVersion(safeExec('node --version'));
  const binPath = findBinPath('node');
  const minimumVersion = '18.0.0';
  const installed = !!version;
  const versionOk = installed ? versionGte(version, minimumVersion) : false;
  return {
    name: 'Node.js',
    installed: installed && versionOk,
    version,
    required: true,
    minimumVersion,
    path: binPath,
    downloadUrl: 'https://nodejs.org/zh-cn/download',
    detectedAt: Date.now(),
  };
}

/** 检测 npm */
export function detectNpm(): EnvInfo {
  const version = parseVersion(safeExec('npm --version'));
  const binPath = findBinPath('npm');
  const minimumVersion = '8.0.0';
  const installed = !!version;
  const versionOk = installed ? versionGte(version, minimumVersion) : false;
  return {
    name: 'npm',
    installed: installed && versionOk,
    version,
    required: true,
    minimumVersion,
    path: binPath,
    downloadUrl: 'https://nodejs.org/zh-cn/download',
    detectedAt: Date.now(),
  };
}

/** 检测 Git */
export function detectGit(): EnvInfo {
  const version = parseVersion(safeExec('git --version'));
  const binPath = findBinPath('git');
  return {
    name: 'Git',
    installed: !!version,
    version,
    required: false,
    path: binPath,
    downloadUrl: 'https://git-scm.com/downloads',
    detectedAt: Date.now(),
  };
}

/** 获取操作系统信息 */
function detectOs(): EnvSummary['os'] {
  const memBytes = (os as any).totalmem?.() || 0;
  return {
    platform: process.platform,
    release: os.release(),
    totalMemoryMB: Math.round(memBytes / 1024 / 1024),
    nodeBinDir: process.execPath ? path.dirname(process.execPath) : undefined,
  };
}

/** 完整环境检测 */
export function checkEnv(): EnvSummary {
  const node = detectNode();
  const npm = detectNpm();
  const git = detectGit();
  const allRequired = node.installed && npm.installed;
  return {
    node,
    npm,
    git,
    os: detectOs(),
    allRequiredInstalled: allRequired,
    detectedAt: Date.now(),
  };
}
