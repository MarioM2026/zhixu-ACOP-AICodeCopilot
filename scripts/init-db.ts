/**
 * 数据库初始化脚本
 * 创建 SQLite 数据库和必需的表结构
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'zhixu.db');

// SQL 建表语句
const createTablesSQL = `
-- 事件表
CREATE TABLE IF NOT EXISTS ai_code_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    tool TEXT NOT NULL,
    model_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    latency INTEGER NOT NULL DEFAULT 0,
    ttft INTEGER,
    error_type TEXT,
    error_message TEXT,
    code_acceptance BOOLEAN DEFAULT TRUE,
    context_overflow BOOLEAN DEFAULT FALSE,
    cost_amount REAL DEFAULT 0,
    cost_currency TEXT DEFAULT 'USD',
    cost_attribution TEXT,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_tool (tool),
    INDEX idx_timestamp (timestamp),
    INDEX idx_session_time (session_id, timestamp)
);

-- 规则表
CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    condition_type TEXT NOT NULL,
    condition_threshold REAL NOT NULL,
    condition_operator TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_config TEXT,
    priority TEXT DEFAULT 'medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 告警表
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    acknowledged BOOLEAN DEFAULT FALSE,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rule_id (rule_id),
    INDEX idx_severity (severity),
    INDEX idx_timestamp (timestamp)
);

-- 统计汇总表
CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT PRIMARY KEY,
    total_requests INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    avg_latency REAL DEFAULT 0,
    error_rate REAL DEFAULT 0,
    total_cost REAL DEFAULT 0,
    sessions_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 工具统计表
CREATE TABLE IF NOT EXISTS tool_stats (
    tool TEXT PRIMARY KEY,
    total_requests INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    avg_latency REAL DEFAULT 0,
    error_rate REAL DEFAULT 0,
    total_cost REAL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// 默认规则
const defaultRules = [
  {
    id: 'rule-001',
    name: '上下文清理预警',
    description: '当 Token 使用超过 80% 时触发',
    enabled: true,
    condition: { type: 'token_threshold', threshold: 0.8, operator: '>' },
    action: { type: 'clear_context', config: { message: '上下文即将溢出，建议清理' } },
    priority: 'high',
  },
  {
    id: 'rule-002',
    name: 'Token 超预算告警',
    description: '单日 Token 消耗超过阈值时发送告警',
    enabled: true,
    condition: { type: 'token_threshold', threshold: 100000, operator: '>' },
    action: { type: 'send_alert', config: { channels: ['dingtalk', 'email'], threshold: 100000 } },
    priority: 'medium',
  },
  {
    id: 'rule-003',
    name: '错误率过高告警',
    description: '当错误率超过 5% 时触发',
    enabled: true,
    condition: { type: 'error_rate', threshold: 5, operator: '>' },
    action: { type: 'send_alert', config: { channels: ['dingtalk'], severity: 'warning' } },
    priority: 'medium',
  },
  {
    id: 'rule-004',
    name: '延迟过高告警',
    description: '当平均延迟超过 5000ms 时触发',
    enabled: true,
    condition: { type: 'latency_threshold', threshold: 5000, operator: '>' },
    action: { type: 'send_alert', config: { channels: ['dingtalk'], severity: 'info' } },
    priority: 'low',
  },
];

/**
 * 初始化数据库
 */
async function initializeDatabase() {
  console.log('='.repeat(60));
  console.log('ACOP 数据库初始化');
  console.log('='.repeat(60));

  // 确保 data 目录存在
  if (!fs.existsSync(dataDir)) {
    console.log('📁 创建 data 目录...');
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 动态导入 better-sqlite3 或使用 sqlite 内存替代方案
  try {
    // 检查是否已有数据库
    if (fs.existsSync(dbPath)) {
      console.log('⚠️  数据库已存在，跳过创建');
      console.log(`   路径: ${dbPath}`);
    } else {
      console.log('📝 创建数据库和表结构...');
      console.log(`   路径: ${dbPath}`);

      // 尝试使用 better-sqlite3
      try {
        const Database = (await import('better-sqlite3')).default;
        const db = new Database(dbPath);

        // 创建表
        db.exec(createTablesSQL);
        console.log('✅ 表结构创建完成');

        // 插入默认规则
        console.log('📝 插入默认规则...');
        const insertRuleStmt = db.prepare(`
          INSERT OR REPLACE INTO rules (id, name, description, enabled, condition_type, condition_threshold, condition_operator, action_type, action_config, priority)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((rules) => {
          for (const rule of rules) {
            insertRuleStmt.run(
              rule.id,
              rule.name,
              rule.description,
              rule.enabled ? 1 : 0,
              rule.condition.type,
              rule.condition.threshold,
              rule.condition.operator,
              rule.action.type,
              JSON.stringify(rule.action.config),
              rule.priority
            );
          }
        });

        insertMany(defaultRules);
        console.log(`✅ 已插入 ${defaultRules.length} 条默认规则`);

        db.close();
      } catch (sqliteError) {
        console.log('⚠️  better-sqlite3 不可用，使用内存存储模式');
        console.log('   提示: 运行 npm install better-sqlite3 以启用数据库功能');

        // 创建一个配置文件来指示使用内存模式
        const config = {
          useMemoryStore: true,
          dbPath: dbPath,
          initialized: true,
        };
        fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
      }
    }

    console.log('\n✅ 数据库初始化完成!');
    console.log('📊 数据库位置: ' + dbPath);
    console.log('\n默认规则:');
    defaultRules.forEach((rule, i) => {
      console.log(`  ${i + 1}. ${rule.name} (${rule.priority})`);
    });

  } catch (error) {
    console.error('\n❌ 数据库初始化失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 重置数据库
 */
async function resetDatabase() {
  console.log('⚠️  警告: 即将重置数据库');

  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('✅ 已删除旧数据库');
  }

  // 删除配置文件
  const configPath = path.join(dataDir, 'config.json');
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }

  await initializeDatabase();
}

/**
 * 显示数据库状态
 */
function showDatabaseStatus() {
  console.log('='.repeat(60));
  console.log('数据库状态检查');
  console.log('='.repeat(60));

  if (!fs.existsSync(dataDir)) {
    console.log('❌ data 目录不存在');
    console.log('   请运行: node scripts/init-db.js 初始化');
    return;
  }

  console.log(`📁 数据目录: ${dataDir}`);
  console.log(`🗂️  数据库文件: ${fs.existsSync(dbPath) ? '存在' : '不存在'}`);
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log(`📊 文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`🕐 修改时间: ${stats.mtime.toLocaleString('zh-CN')}`);
  }

  const configPath = path.join(dataDir, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log(`💾 存储模式: ${config.useMemoryStore ? '内存' : '数据库'}`);
    } catch {
      console.log(`⚠️  配置文件损坏`);
    }
  }

  console.log('='.repeat(60));
}

// 命令行参数处理
const command = process.argv[2];

switch (command) {
  case 'init':
    await initializeDatabase();
    break;
  case 'reset':
    await resetDatabase();
    break;
  case 'status':
    showDatabaseStatus();
    break;
  case undefined:
  case 'help':
  case '--help':
  case '-h':
  default:
    console.log(`
用法:
  node scripts/init-db.js [命令]

命令:
  init    - 初始化数据库
  reset   - 重置数据库（删除并重新创建）
  status  - 显示数据库状态
  help    - 显示帮助信息

示例:
  node scripts/init-db.js init
  node scripts/init-db.js status
`);
    process.exit(0);
}
