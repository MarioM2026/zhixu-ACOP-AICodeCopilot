import fs from 'fs';
import path from 'path';
import type { AiSoftwareInfo, ToolType } from '../../shared/types';

/** 支持的 AI 软件默认检测路径 */
const DEFAULT_CANDIDATE_PATHS: Record<ToolType, string[]> = {
  trae: [
    // Windows
    `${process.env.APPDATA || ''}/Trae SOLO CN/logs`,
    `${process.env.APPDATA || ''}/Trae/logs`,
    `${process.env.LOCALAPPDATA || ''}/Trae SOLO CN/logs`,
    // macOS
    `${process.env.HOME || ''}/Library/Application Support/Trae SOLO CN/logs`,
    `${process.env.HOME || ''}/Library/Application Support/Trae/logs`,
    // Linux
    `${process.env.HOME || ''}/.config/Trae/logs`,
    `${process.env.HOME || ''}/.trae/logs`,
  ].filter(p => p && p.length > 8),
  claude_code: [
    `${process.env.LOCALAPPDATA || ''}/Anthropic/Claude/logs`,
    `${process.env.APPDATA || ''}/Anthropic/Claude/logs`,
    `${process.env.HOME || ''}/Library/Application Support/Anthropic/Claude/logs`,
    `${process.env.HOME || ''}/.anthropic/logs`,
  ].filter(p => p && p.length > 8),
  cursor: [
    `${process.env.APPDATA || ''}/Cursor/User/logs`,
    `${process.env.LOCALAPPDATA || ''}/Cursor/User/logs`,
    `${process.env.HOME || ''}/Library/Application Support/Cursor/User/logs`,
    `${process.env.HOME || ''}/.cursor/logs`,
  ].filter(p => p && p.length > 8),
  github_copilot: [],
  codegeex: [],
};

/** 软件显示名称映射 */
const SOFTWARE_NAMES: Record<ToolType, string> = {
  trae: 'Trae',
  claude_code: 'Claude Code',
  cursor: 'Cursor',
  github_copilot: 'GitHub Copilot',
  codegeex: 'CodeGeeX',
};

/** 要扫描的文件扩展名 */
const LOG_EXTENSIONS = ['.log', '.json', '.txt'];

/** 递归扫描目录下的日志文件数量 */
function countLogFiles(dirPath: string, maxDepth = 3): number {
  let count = 0;
  function scan(currentPath: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (LOG_EXTENSIONS.some(e => ext === e) || /\d{4}-\d{2}-\d{2}/.test(entry.name)) {
            count++;
          }
        }
      }
    } catch {
      // 权限不足或路径不存在，静默忽略
    }
  }
  scan(dirPath, 0);
  return count;
}

/** 获取目录的最新修改时间 */
function getDirLastModified(dirPath: string): number | undefined {
  try {
    const stat = fs.statSync(dirPath);
    return stat.mtime.getTime();
  } catch {
    return undefined;
  }
}

/** 检测单个 AI 软件 */
export function detectAiSoftware(type: ToolType): AiSoftwareInfo {
  const candidates = DEFAULT_CANDIDATE_PATHS[type] || [];
  let detectedPath: string | undefined;
  let detectedCount = 0;

  for (const candidatePath of candidates) {
    try {
      if (fs.existsSync(candidatePath)) {
        const count = countLogFiles(candidatePath);
        // 至少有 1 个日志文件才算有效检测
        if (count >= 1 && count > detectedCount) {
          detectedPath = candidatePath;
          detectedCount = count;
        }
      }
    } catch {
      // 路径访问异常，跳过
    }
  }

  return {
    type,
    name: SOFTWARE_NAMES[type] || type,
    detected: !!detectedPath,
    logPath: detectedPath,
    candidatePaths: candidates,
    enabled: !!detectedPath,  // 默认选中已检测到的
    lastModified: detectedPath ? getDirLastModified(detectedPath) : undefined,
  };
}

/** 扫描所有已支持的 AI 软件 */
export function detectAllAiSoftware(): Record<ToolType, AiSoftwareInfo> {
  const supported: ToolType[] = ['trae', 'claude_code', 'cursor'];
  const result = {} as Record<ToolType, AiSoftwareInfo>;
  for (const type of supported) {
    result[type] = detectAiSoftware(type);
  }
  return result;
}

/** 验证用户手动输入的路径是否有效 */
export function validateAiSoftwarePath(
  software: ToolType,
  userPath: string,
): { success: boolean; exists: boolean; logFiles: number; message: string; path: string } {
  if (!userPath || !userPath.trim()) {
    return { success: false, exists: false, logFiles: 0, message: '路径不能为空', path: userPath };
  }
  const normalizedPath = path.normalize(userPath.trim());
  try {
    if (!fs.existsSync(normalizedPath)) {
      return {
        success: false,
        exists: false,
        logFiles: 0,
        message: '路径不存在，请确认目录是否正确',
        path: normalizedPath,
      };
    }
    const stat = fs.statSync(normalizedPath);
    if (!stat.isDirectory()) {
      return {
        success: false,
        exists: true,
        logFiles: 0,
        message: '路径不是一个目录，请选择日志所在的目录',
        path: normalizedPath,
      };
    }
    const count = countLogFiles(normalizedPath);
    return {
      success: true,
      exists: true,
      logFiles: count,
      message: count > 0
        ? `检测到 ${count} 个日志文件，路径有效`
        : '目录存在，但没有检测到日志文件（初次使用是正常的）',
      path: normalizedPath,
    };
  } catch (err) {
    return {
      success: false,
      exists: false,
      logFiles: 0,
      message: `路径访问失败：${(err as Error).message}`,
      path: normalizedPath,
    };
  }
}
