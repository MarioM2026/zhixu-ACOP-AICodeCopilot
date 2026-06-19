#!/usr/bin/env node

/**
 * Trae MCP 配置脚本
 * 用于帮助用户配置 Trae IDE 的 MCP 设置以连接 知墟
 *
 * 用法:
 *   node scripts/setup-trae-mcp.js
 *
 * 或使用 tsx:
 *   npx tsx scripts/setup-trae-mcp.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Trae MCP 配置文件路径
 * Windows: %APPDATA%\Trae\mcp.json
 * macOS: ~/Library/Application Support/Trae/mcp.json
 * Linux: ~/.config/Trae/mcp.json
 */
function getMcpConfigPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const appData = process.env.APPDATA || '';

  if (process.platform === 'win32') {
    return path.join(appData, 'Trae', 'mcp.json');
  } else if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Trae', 'mcp.json');
  } else {
    return path.join(homeDir, '.config', 'Trae', 'mcp.json');
  }
}

/**
 * 默认的 知墟 MCP 配置
 */
function getDefaultMcpConfig() {
  const zhixuEndpoint = process.env.ZHIXU_ENDPOINT || 'http://localhost:3000';

  return {
    mcpServers: {
      zhixu: {
        command: 'npx',
        args: ['@zhixu/mcp-server', '--endpoint', zhixuEndpoint],
        env: {
          ZHIXU_API_KEY: process.env.ZHIXU_API_KEY || 'your-api-key-here',
        },
      },
    },
  };
}

/**
 * 检查 Trae 是否已安装
 */
function checkTraeInstalled(): boolean {
  // 检查常见安装路径
  const possiblePaths = [
    // Windows
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Trae', 'Trae.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Trae', 'Trae.exe'),
    // macOS
    '/Applications/Trae.app',
    path.join(process.env.HOME || '', 'Applications', 'Trae.app'),
    // Linux
    '/usr/bin/trae',
    '/usr/local/bin/trae',
  ];

  return possiblePaths.some((p) => fs.existsSync(p));
}

/**
 * 读取现有的 MCP 配置
 */
function readExistingMcpConfig(): Record<string, unknown> | null {
  const configPath = getMcpConfigPath();

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('❌ 读取 MCP 配置失败:', error);
    return null;
  }
}

/**
 * 写入 MCP 配置
 */
function writeMcpConfig(config: Record<string, unknown>): boolean {
  const configPath = getMcpConfigPath();

  try {
    // 确保目录存在
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 写入配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('❌ 写入 MCP 配置失败:', error);
    return false;
  }
}

/**
 * 更新 MCP 配置，添加 ACOP 服务器
 */
function updateMcpConfig(): boolean {
  const existingConfig = readExistingMcpConfig();
  const defaultConfig = getDefaultMcpConfig();

  if (existingConfig) {
    // 合并配置
    const mergedConfig = {
      ...existingConfig,
      mcpServers: {
        ...(existingConfig.mcpServers || {}),
        ...defaultConfig.mcpServers,
      },
    };

    return writeMcpConfig(mergedConfig);
  } else {
    // 创建新配置
    return writeMcpConfig(defaultConfig);
  }
}

/**
 * 验证配置
 */
function validateConfig(): { valid: boolean; message: string } {
  const configPath = getMcpConfigPath();

  if (!fs.existsSync(configPath)) {
    return { valid: false, message: 'MCP 配置文件不存在' };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    if (!config.mcpServers) {
      return { valid: false, message: 'MCP 配置缺少 mcpServers 字段' };
    }

    if (!config.mcpServers.zhixu) {
      return { valid: false, message: 'MCP 配置缺少 zhixu 服务器配置' };
    }

    return { valid: true, message: '配置验证通过' };
  } catch (error) {
    return { valid: false, message: `配置验证失败: ${error}` };
  }
}

/**
 * 打印使用说明
 */
function printInstructions(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    ACOP Trae MCP 配置完成                            ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  配置步骤:                                                           ║
║  1. 重启 Trae IDE                                                    ║
║  2. 打开设置 -> MCP Server                                            ║
║  3. 确认 ACOP 服务器状态为 "已连接"                                   ║
║                                                                      ║
║  配置位置:                                                           ║
║  ${getMcpConfigPath().substring(0, 60)}
║                                                                      ║
║  环境变量 (可选):                                                    ║
║  - ACOP_ENDPOINT: ACOP 服务器地址 (默认: http://localhost:3000)      ║
║  - ACOP_API_KEY: API 密钥 (默认: your-api-key-here)                  ║
║                                                                      ║
║  启动 ACOP 后端:                                                     ║
║  npm run dev                                                        ║
║                                                                      ║
║  验证配置:                                                           ║
║  npm run validate:mcp                                                ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
  `);
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                 ACOP Trae MCP 配置工具 v1.0                          ║
╚══════════════════════════════════════════════════════════════════════╝
  `);

  // 检查 Trae 是否安装
  console.log('📋 检查 Trae 安装状态...');
  if (!checkTraeInstalled()) {
    console.log('⚠️  警告: 未检测到 Trae 安装，可能无法自动配置。');
    console.log('   请手动配置 MCP。\n');
  } else {
    console.log('✅ 检测到 Trae 安装\n');
  }

  // 更新配置
  console.log('📝 更新 MCP 配置...');
  if (updateMcpConfig()) {
    console.log('✅ MCP 配置已更新\n');
  } else {
    console.log('❌ MCP 配置更新失败\n');
    process.exit(1);
  }

  // 验证配置
  console.log('🔍 验证 MCP 配置...');
  const validation = validateConfig();
  if (validation.valid) {
    console.log('✅ 配置验证通过\n');
  } else {
    console.log(`⚠️  配置验证: ${validation.message}\n`);
  }

  // 打印使用说明
  printInstructions();
}

main().catch((error) => {
  console.error('❌ 配置失败:', error);
  process.exit(1);
});
