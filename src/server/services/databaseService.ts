/**
 * DatabaseService - SQLite 数据库包装器
 *
 * 使用 sql.js（WASM 纯 JS 实现）提供 SQLite 支持，无需 native 编译
 * 当 sql.js 不可用时自动降级到内存模式
 *
 * 表结构：
 *   - ai_code_events    事件记录
 *   - rules              规则配置
 *   - alerts             告警历史
 *   - daily_stats        日统计
 *   - tool_stats         工具统计
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

// ============= 类型定义 =============

export interface DatabaseConfig {
  dbPath: string;
  autoSave: boolean;
  autoSaveIntervalMs: number;
}

// ============= 数据库单例 =============

let _db: any = null;
let _SQL: any = null;
let _config: DatabaseConfig = {
  dbPath: '',
  autoSave: false,
  autoSaveIntervalMs: 0,
};
let _autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let _useSqlite = false;

// ============= 初始化 =============

/**
 * 初始化数据库（自动检测 sql.js 是否可用）
 */
export async function initDatabase(customPath?: string): Promise<void> {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = customPath || path.join(dataDir, 'zhixu-acop.db');
  _config.dbPath = dbPath;

  try {
    const sqljs = await import('sql.js');
    const SQL = await sqljs.default();
    _SQL = SQL;

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      _db = new SQL.Database(fileBuffer);
      logger.info(`[Database] SQLite 加载成功: ${dbPath} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
    } else {
      _db = new SQL.Database();
      logger.info(`[Database] SQLite 新建数据库: ${dbPath}`);
    }

    _createTables();
    _startAutoSave();
    _useSqlite = true;
    logger.info('[Database] SQLite 模式已启用');
  } catch (err) {
    logger.warn(`[Database] sql.js 不可用，回退到内存模式: ${(err as Error).message}`);
    _useSqlite = false;
  }
}

/** 创建所有表 */
function _createTables(): void {
  if (!_db) return;

  _db.run(`
    CREATE TABLE IF NOT EXISTS ai_code_events (
      id           TEXT    PRIMARY KEY,
      session_id   TEXT    NOT NULL,
      trace_id     TEXT    NOT NULL,
      timestamp    INTEGER NOT NULL,
      tool         TEXT    NOT NULL,
      model_id     TEXT    NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      latency      INTEGER NOT NULL DEFAULT 0,
      ttft         INTEGER,
      error_type   TEXT,
      error_message TEXT,
      code_acceptance INTEGER,
      context_overflow INTEGER,
      cost_amount  REAL    DEFAULT 0,
      cost_currency TEXT   DEFAULT 'USD',
      cost_attribution TEXT,
      metadata     TEXT,
      created_at   INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  _db.run(`CREATE INDEX IF NOT EXISTS idx_events_session ON ai_code_events(session_id)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_events_tool   ON ai_code_events(tool)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_events_time   ON ai_code_events(timestamp)`);

  _db.run(`
    CREATE TABLE IF NOT EXISTS rules (
      id          TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL,
      description TEXT,
      enabled     INTEGER NOT NULL DEFAULT 1,
      condition_type TEXT NOT NULL,
      condition_threshold REAL NOT NULL,
      condition_operator TEXT NOT NULL,
      action_type TEXT    NOT NULL,
      action_config TEXT,
      priority    TEXT    DEFAULT 'medium',
      created_at  INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at  INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id          TEXT    PRIMARY KEY,
      rule_id     TEXT    NOT NULL,
      severity    TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      timestamp   INTEGER NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      metadata    TEXT,
      created_at  INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  _db.run(`CREATE INDEX IF NOT EXISTS idx_alerts_rule    ON alerts(rule_id)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_alerts_time   ON alerts(timestamp)`);

  _db.run(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      date         TEXT    PRIMARY KEY,
      total_requests INTEGER DEFAULT 0,
      total_tokens   INTEGER DEFAULT 0,
      avg_latency    REAL    DEFAULT 0,
      error_rate     REAL    DEFAULT 0,
      total_cost     REAL    DEFAULT 0,
      sessions_count INTEGER DEFAULT 0,
      updated_at      INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS tool_stats (
      tool          TEXT    PRIMARY KEY,
      total_requests INTEGER DEFAULT 0,
      total_tokens   INTEGER DEFAULT 0,
      avg_latency    REAL    DEFAULT 0,
      error_rate     REAL    DEFAULT 0,
      total_cost     REAL    DEFAULT 0,
      last_updated   INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);
}

// ============= 事件 CRUD =============

export interface DbEvent {
  id: string;
  session_id: string;
  trace_id: string;
  timestamp: number;
  tool: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency: number;
  ttft?: number;
  error_type?: string;
  error_message?: string;
  code_acceptance?: boolean;
  context_overflow?: boolean;
  cost_amount?: number;
  cost_currency?: string;
  cost_attribution?: string;
  metadata?: string;
}

/** 插入事件 */
export function insertEvent(event: DbEvent): void {
  if (!_db || !_useSqlite) return;

  const stmt = _db.prepare(`
    INSERT OR REPLACE INTO ai_code_events
      (id, session_id, trace_id, timestamp, tool, model_id,
       input_tokens, output_tokens, total_tokens, latency, ttft,
       error_type, error_message, code_acceptance, context_overflow,
       cost_amount, cost_currency, cost_attribution, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    event.id, event.session_id, event.trace_id, event.timestamp, event.tool, event.model_id,
    event.input_tokens, event.output_tokens, event.total_tokens, event.latency, event.ttft ?? null,
    event.error_type ?? null, event.error_message ?? null,
    event.code_acceptance != null ? (event.code_acceptance ? 1 : 0) : null,
    event.context_overflow != null ? (event.context_overflow ? 1 : 0) : null,
    event.cost_amount ?? 0, event.cost_currency ?? 'USD', event.cost_attribution ?? null,
    event.metadata ?? null,
  ]);
  stmt.free();
}

/** 批量插入事件 */
export function insertEvents(events: DbEvent[]): void {
  if (!_db || !_useSqlite) return;
  const stmt = _db.prepare(`
    INSERT OR REPLACE INTO ai_code_events
      (id, session_id, trace_id, timestamp, tool, model_id,
       input_tokens, output_tokens, total_tokens, latency, ttft,
       error_type, error_message, code_acceptance, context_overflow,
       cost_amount, cost_currency, cost_attribution, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const event of events) {
    stmt.run([
      event.id, event.session_id, event.trace_id, event.timestamp, event.tool, event.model_id,
      event.input_tokens, event.output_tokens, event.total_tokens, event.latency, event.ttft ?? null,
      event.error_type ?? null, event.error_message ?? null,
      event.code_acceptance != null ? (event.code_acceptance ? 1 : 0) : null,
      event.context_overflow != null ? (event.context_overflow ? 1 : 0) : null,
      event.cost_amount ?? 0, event.cost_currency ?? 'USD', event.cost_attribution ?? null,
      event.metadata ?? null,
    ]);
  }
  stmt.free();
}

/** 查询事件（分页） */
export function queryEvents(options: {
  tool?: string;
  startTime?: number;
  endTime?: number;
  sessionId?: string;
  page?: number;
  pageSize?: number;
  sortDesc?: boolean;
} = {}): { data: DbEvent[]; total: number } {
  if (!_db || !_useSqlite) {
    return { data: [], total: 0 };
  }

  const { tool, startTime, endTime, sessionId, page = 1, pageSize = 20, sortDesc = true } = options;
  const conditions: string[] = [];
  const params: any[] = [];

  if (tool) { conditions.push('tool = ?'); params.push(tool); }
  if (startTime) { conditions.push('timestamp >= ?'); params.push(startTime); }
  if (endTime) { conditions.push('timestamp <= ?'); params.push(endTime); }
  if (sessionId) { conditions.push('session_id = ?'); params.push(sessionId); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const order = sortDesc ? 'ORDER BY timestamp DESC' : 'ORDER BY timestamp ASC';
  const offset = (page - 1) * pageSize;

  const totalRow = _db.exec(`SELECT COUNT(*) as cnt FROM ai_code_events ${where}`, params);
  const total = totalRow[0]?.values[0]?.[0] as number || 0;

  const dataRows = _db.exec(
    `SELECT * FROM ai_code_events ${where} ${order} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const data = _rowsToObjects(dataRows);
  return { data, total };
}

/** 获取事件总数 */
export function getEventCount(): number {
  if (!_db || !_useSqlite) return 0;
  try {
    const result = _db.exec('SELECT COUNT(*) as cnt FROM ai_code_events');
    return (result[0]?.values[0]?.[0] as number) || 0;
  } catch {
    return 0;
  }
}

// ============= 规则 CRUD =============

export interface DbRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  condition_type: string;
  condition_threshold: number;
  condition_operator: string;
  action_type: string;
  action_config?: string;
  priority: string;
  created_at?: number;
  updated_at?: number;
}

/** 插入或更新规则 */
export function upsertRule(rule: DbRule): void {
  if (!_db || !_useSqlite) return;
  _db.run(`
    INSERT OR REPLACE INTO rules
      (id, name, description, enabled, condition_type, condition_threshold,
       condition_operator, action_type, action_config, priority, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now') * 1000)
  `, [
    rule.id, rule.name, rule.description ?? null,
    rule.enabled ? 1 : 0,
    rule.condition_type, rule.condition_threshold, rule.condition_operator,
    rule.action_type, rule.action_config ?? null, rule.priority,
  ]);
}

/** 查询所有规则 */
export function queryRules(): DbRule[] {
  if (!_db || !_useSqlite) return [];
  const rows = _db.exec('SELECT * FROM rules ORDER BY created_at DESC');
  return _rowsToObjects(rows).map(r => ({
    ...r,
    enabled: Boolean(r.enabled),
    code_acceptance: r.code_acceptance ? Boolean(r.code_acceptance) : undefined,
    context_overflow: r.context_overflow ? Boolean(r.context_overflow) : undefined,
  }));
}

/** 删除规则 */
export function deleteRule(ruleId: string): void {
  if (!_db || !_useSqlite) return;
  _db.run('DELETE FROM rules WHERE id = ?', [ruleId]);
}

// ============= 告警 CRUD =============

export interface DbAlert {
  id: string;
  rule_id: string;
  severity: string;
  title: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
  metadata?: string;
}

/** 插入告警 */
export function insertAlert(alert: DbAlert): void {
  if (!_db || !_useSqlite) return;
  _db.run(`
    INSERT INTO alerts (id, rule_id, severity, title, message, timestamp, acknowledged, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    alert.id, alert.rule_id, alert.severity, alert.title, alert.message,
    alert.timestamp, alert.acknowledged ? 1 : 0, alert.metadata ?? null,
  ]);
}

/** 查询告警 */
export function queryAlerts(options: { page?: number; pageSize?: number } = {}): DbAlert[] {
  if (!_db || !_useSqlite) return [];
  const { page = 1, pageSize = 20 } = options;
  const offset = (page - 1) * pageSize;
  const rows = _db.exec(
    `SELECT * FROM alerts ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );
  return _rowsToObjects(rows).map(r => ({
    ...r,
    acknowledged: Boolean(r.acknowledged),
  }));
}

// ============= 统计 =============

/** 更新日统计 */
export function upsertDailyStats(date: string, stats: {
  total_requests?: number;
  total_tokens?: number;
  avg_latency?: number;
  error_rate?: number;
  total_cost?: number;
  sessions_count?: number;
}): void {
  if (!_db || !_useSqlite) return;
  _db.run(`
    INSERT INTO daily_stats (date, total_requests, total_tokens, avg_latency, error_rate, total_cost, sessions_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now') * 1000)
    ON CONFLICT(date) DO UPDATE SET
      total_requests = total_requests + excluded.total_requests,
      total_tokens   = total_tokens   + excluded.total_tokens,
      avg_latency    = (avg_latency    + excluded.avg_latency) / 2,
      error_rate     = (error_rate     + excluded.error_rate)  / 2,
      total_cost     = total_cost     + excluded.total_cost,
      sessions_count = MAX(sessions_count, excluded.sessions_count),
      updated_at     = strftime('%s','now') * 1000
  `, [
    date,
    stats.total_requests ?? 0,
    stats.total_tokens ?? 0,
    stats.avg_latency ?? 0,
    stats.error_rate ?? 0,
    stats.total_cost ?? 0,
    stats.sessions_count ?? 0,
  ]);
}

/** 查询日统计 */
export function queryDailyStats(days = 7): { date: string; total_tokens: number }[] {
  if (!_db || !_useSqlite) return [];
  const rows = _db.exec(
    `SELECT date, total_tokens FROM daily_stats ORDER BY date DESC LIMIT ?`,
    [days]
  );
  return _rowsToObjects(rows);
}

// ============= 工具函数 =============

/** 将 sql.js exec 结果转为对象数组 */
function _rowsToObjects(result: any[]): any[] {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
}

/** 持久化数据库到文件 */
export function saveDatabase(): void {
  if (!_db || !_useSqlite || !_config.dbPath) return;
  try {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(_config.dbPath, buffer);
    logger.info(`[Database] 已保存数据库到 ${_config.dbPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    logger.error(`[Database] 保存数据库失败: ${(err as Error).message}`);
  }
}

/** 启动自动保存 */
function _startAutoSave(): void {
  if (_autoSaveTimer) clearInterval(_autoSaveTimer);
  if (_config.autoSave && _config.autoSaveIntervalMs > 0) {
    _autoSaveTimer = setInterval(saveDatabase, _config.autoSaveIntervalMs);
  }
}

/** 关闭数据库 */
export function closeDatabase(): void {
  if (_autoSaveTimer) {
    clearInterval(_autoSaveTimer);
    _autoSaveTimer = null;
  }
  if (_db) {
    saveDatabase();
    _db.close();
    _db = null;
  }
  _useSqlite = false;
  logger.info('[Database] 数据库已关闭');
}

/** 是否使用 SQLite 模式 */
export function isSqliteMode(): boolean {
  return _useSqlite;
}
