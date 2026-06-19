import { useState, useEffect } from 'react';
import { api } from '../services/api';

interface ContextSession {
  sessionId: string;
  tool: string;
  modelId: string;
  eventCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  avgLatency: number;
  errorCount: number;
  errorRate: number;
  codeAcceptanceRate: number;
  contextOverflowCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
  inactiveHours: number;
  importanceScore: number;
  importanceFactors: { recency: number; tokenUsage: number; quality: number; taskComplexity: number };
  taskTypes: string[];
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAction: 'keep' | 'archive' | 'cleanup' | 'new_session';
  recommendedActionReason: string;
}

interface ContextStats {
  totalSessions: number;
  totalTokens: number;
  atRiskSessions: number;
  overflowSessions: number;
  inactiveSessions: number;
  avgTokensPerSession: number;
  recommendedArchiveCount: number;
  recommendedCleanupCount: number;
  recommendedNewSessionCount: number;
  sessionsByTool: Record<string, number>;
  sessionsByRisk: Record<'low' | 'medium' | 'high', number>;
}

interface ContextConfig {
  contextLimits: Record<string, number>;
  inactivityThresholdHours: number;
  importanceWeights: { recency: number; tokenUsage: number; quality: number; taskComplexity: number };
  cleanupThresholds: { archiveScore: number; cleanupScore: number; newSessionTokenRatio: number };
}

const RISK_COLORS: Record<string, string> = {
  low: 'var(--success-color)',
  medium: 'var(--warning-color)',
  high: 'var(--error-color)',
};
const RISK_BG: Record<string, string> = {
  low: 'rgba(16, 185, 129, 0.15)',
  medium: 'rgba(245, 158, 11, 0.15)',
  high: 'rgba(239, 68, 68, 0.15)',
};
const RISK_LABELS = { low: '低风险', medium: '中风险', high: '高风险' };

const ACTION_LABELS: Record<string, { name: string; cssClass: string }> = {
  keep: { name: '保持', cssClass: 'badge-success' },
  archive: { name: '建议归档', cssClass: 'badge-info' },
  cleanup: { name: '建议清理', cssClass: 'badge-error' },
  new_session: { name: '建议新建', cssClass: 'badge-warning' },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatHours(h: number): string {
  if (h < 1) return '刚刚';
  if (h < 24) return `${h}h 前`;
  if (h < 24 * 7) return `${Math.round(h / 24)}天 前`;
  return `${Math.round(h / 24 / 7)}周 前`;
}

function PulseIndicator({ active }: { active: boolean }) {
  return (
    <div className={`pulse-indicator ${active ? 'active' : 'inactive'}`}>
      <span className="pulse-dot" />
      <span className="pulse-ring" />
    </div>
  );
}

function ContextManagement() {
  const [activeTab, setActiveTab] = useState<'sessions' | 'stats' | 'config' | 'history'>('sessions');
  const [sessions, setSessions] = useState<ContextSession[]>([]);
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [config, setConfig] = useState<ContextConfig | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ContextSession | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');

  async function loadSessions(force = false) {
    setLoading(true);
    try {
      const res = await api.get('/api/context/sessions' + (force ? '?force=true' : ''));
      if (res.success) setSessions(res.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function loadStats() {
    try {
      const res = await api.get('/api/context/stats');
      if (res.success) setStats(res.data);
    } catch (e) { console.error(e); }
  }

  async function loadConfig() {
    try {
      const res = await api.get('/api/context/config');
      if (res.success) setConfig(res.data);
    } catch (e) { console.error(e); }
  }

  async function loadHistory() {
    try {
      const res = await api.get('/api/context/history?limit=50');
      if (res.success) setHistory(res.data || []);
    } catch (e) { console.error(e); }
  }

  async function handleAction(sessionId: string, action: string, reason: string) {
    try {
      await api.post(`/api/context/sessions/${sessionId}/action`, { action, reason });
      loadSessions(true);
      loadHistory();
    } catch (e) { console.error(e); }
  }

  useEffect(() => { loadSessions(); loadStats(); loadConfig(); loadHistory(); }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'sessions') loadSessions();
      if (activeTab === 'stats') loadStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const filtered = sessions.filter(s => {
    if (riskFilter !== 'all' && s.riskLevel !== riskFilter) return false;
    if (actionFilter !== 'all' && s.recommendedAction !== actionFilter) return false;
    if (searchText && !s.sessionId.toLowerCase().includes(searchText.toLowerCase()) &&
        !s.summary.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="page">
      {/* 背景效果 */}
      <div className="bg-grid" />
      <div className="bg-glow" />

      {/* 页面头部 */}
      <div className="page-header">
        <div className="header-left">
          <div className="title-wrapper">
            <PulseIndicator active={true} />
            <h1 className="page-title">
              <span className="title-main">上下文管理</span>
              <span className="title-acop">CONTEXT</span>
            </h1>
          </div>
          <div className="system-info">
            <span className="info-item">
              <span className="info-label">会话数</span>
              <span className="info-value">{sessions.length}</span>
            </span>
          </div>
        </div>
        <div className="header-right">
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-refresh" onClick={() => loadSessions(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>{loading ? '分析中...' : '重新分析'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="tab-bar">
        {[
          { key: 'sessions', label: '📋 会话列表', count: sessions.length },
          { key: 'stats', label: '📊 统计概览' },
          { key: 'config', label: '⚙️ 评分配置' },
          { key: 'history', label: '📜 操作历史' },
        ].map(t => (
          <button
            key={t.key}
            className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key as any)}
          >
            {t.label}
            {'count' in t ? ` (${sessions.length})` : ''}
          </button>
        ))}
      </div>

      {/* 会话列表 */}
      {activeTab === 'sessions' && (
        <div className="card-panel">
          <div className="panel-header">
            <div className="panel-title-wrapper">
              <span className="panel-indicator" />
              <span className="panel-title">会话画像</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="搜索会话..."
                className="input"
                style={{ width: '180px' }}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
              <select className="select" style={{ width: '120px' }} value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
                <option value="all">全部风险</option>
                <option value="low">🟢 低风险</option>
                <option value="medium">🟡 中风险</option>
                <option value="high">🔴 高风险</option>
              </select>
              <select className="select" style={{ width: '120px' }} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
                <option value="all">全部建议</option>
                <option value="keep">保持</option>
                <option value="archive">建议归档</option>
                <option value="cleanup">建议清理</option>
                <option value="new_session">建议新建</option>
              </select>
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>会话 ID</th>
                  <th>重要度</th>
                  <th>风险</th>
                  <th>建议</th>
                  <th>工具/模型</th>
                  <th>Tokens</th>
                  <th>调用</th>
                  <th>活跃</th>
                  <th>摘要</th>
                </tr>
              </thead>
              <tbody>
                {loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '3rem' }}>
                      <div className="loading" style={{ margin: '0 auto' }} />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                      暂无会话数据
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => {
                    const act = ACTION_LABELS[s.recommendedAction] || ACTION_LABELS.keep;
                    const scoreColor = s.importanceScore > 70 ? 'var(--success-color)' : s.importanceScore > 40 ? 'var(--warning-color)' : 'var(--error-color)';
                    return (
                      <tr key={s.sessionId} className="clickable-row" onClick={() => setSelectedSession(s)}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{s.sessionId.slice(0, 16)}...</td>
                        <td>
                          <span style={{ fontWeight: 'bold', color: scoreColor, fontSize: '1.1rem' }}>{s.importanceScore}</span>
                          <div style={{ display: 'flex', gap: '2px', marginTop: '2px' }}>
                            {[
                              { label: '时', value: s.importanceFactors.recency, color: '#3b82f6' },
                              { label: 'T', value: s.importanceFactors.tokenUsage, color: '#8b5cf6' },
                              { label: '质', value: s.importanceFactors.quality, color: '#10b981' },
                              { label: '复', value: s.importanceFactors.taskComplexity, color: '#f59e0b' },
                            ].map(f => (
                              <div key={f.label} title={`${f.label}: ${f.value}`} style={{ width: '20px', height: '3px', background: `rgba(${f.color === '#3b82f6' ? '59,130,246' : f.color === '#8b5cf6' ? '139,92,246' : f.color === '#10b981' ? '16,185,129' : '245,158,11'},${f.value / 100})`, borderRadius: '2px' }}>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${s.riskLevel === 'low' ? 'badge-success' : s.riskLevel === 'medium' ? 'badge-warning' : 'badge-error'}`}>
                            {RISK_LABELS[s.riskLevel]}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${act.cssClass}`}>{act.name}</span>
                        </td>
                        <td>
                          <span className="badge badge-success">{s.tool}</span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.modelId}</div>
                        </td>
                        <td style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{s.totalTokens.toLocaleString()}</td>
                        <td>{s.eventCount}</td>
                        <td style={{ fontSize: '0.75rem' }}>{formatHours(s.inactiveHours)}</td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.summary}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 统计概览 */}
      {activeTab === 'stats' && stats && (
        <>
          <div className="stats-grid">
            {[
              { label: '总会话数', value: stats.totalSessions, color: 'var(--accent-color)' },
              { label: '高风险', value: stats.atRiskSessions, color: 'var(--error-color)' },
              { label: '上下文溢出', value: stats.overflowSessions, color: 'var(--warning-color)' },
              { label: '不活动', value: stats.inactiveSessions, color: 'var(--text-secondary)' },
            ].map(c => (
              <div key={c.label} className="stat-card">
                <div className="stat-value" style={{ color: c.color }}>{c.value.toLocaleString()}</div>
                <div className="stat-label">{c.label}</div>
              </div>
            ))}
          </div>

          <div className="grid-2col" style={{ gap: '1rem' }}>
            <div className="card-panel">
              <div className="panel-header">
                <div className="panel-title-wrapper">
                  <span className="panel-indicator" />
                  <span className="panel-title">清理建议分布</span>
                </div>
              </div>
              <div className="table-container">
                <table>
                  <tbody>
                    {[
                      { label: '建议新建会话', value: stats.recommendedNewSessionCount, color: 'var(--warning-color)' },
                      { label: '建议归档', value: stats.recommendedArchiveCount, color: 'var(--accent-color)' },
                      { label: '建议清理', value: stats.recommendedCleanupCount, color: 'var(--error-color)' },
                    ].map(it => (
                      <tr key={it.label}>
                        <td style={{ color: 'var(--text-secondary)' }}>{it.label}</td>
                        <td>
                          <div className="progress-bar-container">
                            <div className="progress-bar-fill" style={{ width: `${stats.totalSessions > 0 ? Math.min(100, (it.value / stats.totalSessions) * 100) : 0}%`, backgroundColor: it.color }} />
                          </div>
                        </td>
                        <td style={{ color: it.color, fontWeight: 'bold', minWidth: '50px', textAlign: 'right' }}>{it.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card-panel">
              <div className="panel-header">
                <div className="panel-title-wrapper">
                  <span className="panel-indicator" />
                  <span className="panel-title">风险等级分布</span>
                </div>
              </div>
              <div className="table-container">
                <table>
                  <tbody>
                    {(['low', 'medium', 'high'] as const).map(r => {
                      const count = stats.sessionsByRisk[r] || 0;
                      return (
                        <tr key={r}>
                          <td>
                            <span style={{ color: RISK_COLORS[r] }}>{RISK_LABELS[r]}</span>
                          </td>
                          <td>
                            <div className="progress-bar-container">
                              <div className="progress-bar-fill" style={{ width: `${stats.totalSessions > 0 ? Math.min(100, (count / stats.totalSessions) * 100) : 0}%`, backgroundColor: RISK_COLORS[r] }} />
                            </div>
                          </td>
                          <td style={{ color: RISK_COLORS[r], fontWeight: 'bold', minWidth: '50px', textAlign: 'right' }}>{count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card-panel">
            <div className="panel-header">
              <div className="panel-title-wrapper">
                <span className="panel-indicator" />
                <span className="panel-title">按工具分布</span>
              </div>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>工具</th>
                    <th>会话数</th>
                    <th>占比</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.sessionsByTool).map(([tool, count]) => (
                    <tr key={tool}>
                      <td><span className="badge badge-success">{tool}</span></td>
                      <td style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{count}</td>
                      <td>{stats.totalSessions > 0 ? ((count / stats.totalSessions) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'stats' && !stats && (
        <div className="card-panel">
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>加载中...</div>
        </div>
      )}

      {/* 评分配置 */}
      {activeTab === 'config' && config && (
        <div className="grid-2col">
          <div className="card-panel">
            <div className="panel-header">
              <div className="panel-title-wrapper">
                <span className="panel-indicator" />
                <span className="panel-title">重要度权重</span>
              </div>
            </div>
            <div style={{ padding: '1rem' }}>
              {[
                { label: '时效性', value: config.importanceWeights.recency, color: '#3b82f6' },
                { label: 'Token使用量', value: config.importanceWeights.tokenUsage, color: '#8b5cf6' },
                { label: '质量', value: config.importanceWeights.quality, color: '#10b981' },
                { label: '任务复杂度', value: config.importanceWeights.taskComplexity, color: '#f59e0b' },
              ].map(w => (
                <div key={w.label} style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                    <span>{w.label}</span>
                    <span style={{ color: w.color, fontWeight: 'bold' }}>{(w.value * 100).toFixed(0)}%</span>
                  </div>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{ width: `${w.value * 100}%`, backgroundColor: w.color }} />
                  </div>
                </div>
              ))}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                总计: {(Object.values(config.importanceWeights).reduce((a, b) => a + b, 0) * 100).toFixed(0)}% (应为 100%)
              </div>
            </div>
          </div>

          <div className="card-panel">
            <div className="panel-header">
              <div className="panel-title-wrapper">
                <span className="panel-indicator" />
                <span className="panel-title">阈值配置</span>
              </div>
            </div>
            <div className="table-container">
              <table>
                <tbody>
                  <tr>
                    <td>归档阈值</td>
                    <td style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{config.cleanupThresholds.archiveScore}</td>
                  </tr>
                  <tr>
                    <td>清理阈值</td>
                    <td style={{ color: 'var(--error-color)', fontWeight: 'bold' }}>{config.cleanupThresholds.cleanupScore}</td>
                  </tr>
                  <tr>
                    <td>新建会话比例</td>
                    <td style={{ color: 'var(--warning-color)', fontWeight: 'bold' }}>{(config.cleanupThresholds.newSessionTokenRatio * 100).toFixed(0)}%</td>
                  </tr>
                  <tr>
                    <td>不活动阈值</td>
                    <td>{config.inactivityThresholdHours}h ({Math.round(config.inactivityThresholdHours / 24)}天)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'config' && !config && (
        <div className="card-panel">
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>加载中...</div>
        </div>
      )}

      {/* 操作历史 */}
      {activeTab === 'history' && (
        <div className="card-panel">
          <div className="panel-header">
            <div className="panel-title-wrapper">
              <span className="panel-indicator" />
              <span className="panel-title">最近 50 条操作</span>
            </div>
          </div>
          <div className="table-container">
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>暂无操作记录</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>操作</th>
                    <th>会话 ID</th>
                    <th>原因</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h: any) => {
                    const act = ACTION_LABELS[h.action] || ACTION_LABELS.keep;
                    return (
                      <tr key={h.id}>
                        <td><span className={`badge ${act.cssClass}`}>{act.name}</span></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{h.sessionId?.slice(0, 16)}...</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{h.reason}</td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatTime(h.actionAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 会话详情弹窗 */}
      {selectedSession && (
        <div className="modal-overlay" onClick={() => setSelectedSession(null)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">会话详情</h2>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{selectedSession.sessionId}</div>
              </div>
              <button className="modal-close" onClick={() => setSelectedSession(null)}>×</button>
            </div>
            <div className="modal-body">
              {/* 重要度 + 风险 + 建议 */}
              <div className="detail-stats">
                <div className="detail-stat">
                  <div className="detail-stat-value" style={{ color: selectedSession.importanceScore > 70 ? 'var(--success-color)' : selectedSession.importanceScore > 40 ? 'var(--warning-color)' : 'var(--error-color)' }}>
                    {selectedSession.importanceScore}
                  </div>
                  <div className="detail-stat-label">重要度</div>
                </div>
                <div className="detail-stat">
                  <div className="detail-stat-value" style={{ color: RISK_COLORS[selectedSession.riskLevel] }}>
                    {RISK_LABELS[selectedSession.riskLevel]}
                  </div>
                  <div className="detail-stat-label">风险等级</div>
                </div>
                <div className="detail-stat">
                  <div className="detail-stat-value" style={{ color: selectedSession.recommendedAction === 'keep' ? 'var(--success-color)' : 'var(--warning-color)' }}>
                    {ACTION_LABELS[selectedSession.recommendedAction]?.name}
                  </div>
                  <div className="detail-stat-label">建议操作</div>
                </div>
              </div>

              <div className="info-banner" style={{ background: RISK_BG[selectedSession.riskLevel], borderColor: RISK_COLORS[selectedSession.riskLevel] }}>
                💡 {selectedSession.recommendedActionReason}
              </div>

              {/* 四因子 */}
              <div className="detail-section">
                <h3 className="detail-section-title">评分因子</h3>
                <div className="detail-factors">
                  {[
                    { label: '时效性', value: selectedSession.importanceFactors.recency, color: '#3b82f6', detail: `${formatHours(selectedSession.inactiveHours)}` },
                    { label: 'Token量', value: selectedSession.importanceFactors.tokenUsage, color: '#8b5cf6', detail: `${selectedSession.totalTokens.toLocaleString()} tokens` },
                    { label: '质量', value: selectedSession.importanceFactors.quality, color: '#10b981', detail: `接受率 ${(selectedSession.codeAcceptanceRate * 100).toFixed(0)}%` },
                    { label: '复杂度', value: selectedSession.importanceFactors.taskComplexity, color: '#f59e0b', detail: `${selectedSession.taskTypes.length} 类任务` },
                  ].map(f => (
                    <div key={f.label} className="factor-item">
                      <div className="factor-header">
                        <span>{f.label}</span>
                        <span style={{ color: f.color, fontWeight: 'bold' }}>{f.value}</span>
                      </div>
                      <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{ width: `${f.value}%`, backgroundColor: f.color }} />
                      </div>
                      <div className="factor-detail">{f.detail}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 基本信息 */}
              <div className="detail-grid">
                <div className="detail-cell">
                  <div className="detail-cell-label">工具</div>
                  <div className="detail-cell-value"><span className="badge badge-success">{selectedSession.tool}</span></div>
                </div>
                <div className="detail-cell">
                  <div className="detail-cell-label">模型</div>
                  <div className="detail-cell-value" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{selectedSession.modelId}</div>
                </div>
                <div className="detail-cell">
                  <div className="detail-cell-label">调用次数</div>
                  <div className="detail-cell-value" style={{ color: 'var(--accent-color)' }}>{selectedSession.eventCount}</div>
                </div>
                <div className="detail-cell">
                  <div className="detail-cell-label">平均延迟</div>
                  <div className="detail-cell-value">{selectedSession.avgLatency}ms</div>
                </div>
                <div className="detail-cell">
                  <div className="detail-cell-label">输入 Token</div>
                  <div className="detail-cell-value">{selectedSession.totalInputTokens.toLocaleString()}</div>
                </div>
                <div className="detail-cell">
                  <div className="detail-cell-label">输出 Token</div>
                  <div className="detail-cell-value">{selectedSession.totalOutputTokens.toLocaleString()}</div>
                </div>
                <div className="detail-cell">
                  <div className="detail-cell-label">首次活跃</div>
                  <div className="detail-cell-value">{formatTime(selectedSession.firstTimestamp)}</div>
                </div>
                <div className="detail-cell">
                  <div className="detail-cell-label">最后活跃</div>
                  <div className="detail-cell-value">{formatTime(selectedSession.lastTimestamp)}</div>
                </div>
                <div className="detail-cell">
                  <div className="detail-cell-label">错误率</div>
                  <div className="detail-cell-value" style={{ color: selectedSession.errorRate > 0.2 ? 'var(--error-color)' : 'var(--success-color)' }}>{(selectedSession.errorRate * 100).toFixed(0)}%</div>
                </div>
                <div className="detail-cell">
                  <div className="detail-cell-label">上下文溢出</div>
                  <div className="detail-cell-value" style={{ color: selectedSession.contextOverflowCount > 0 ? 'var(--warning-color)' : 'var(--text-secondary)' }}>{selectedSession.contextOverflowCount} 次</div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="detail-actions">
                <button className="btn btn-secondary" onClick={() => { handleAction(selectedSession.sessionId, 'keep', '手动确认保持'); setSelectedSession(null); }}>
                  ✓ 保持会话
                </button>
                {selectedSession.recommendedAction !== 'keep' && (
                  <button
                    className="btn btn-primary"
                    onClick={() => { handleAction(selectedSession.sessionId, selectedSession.recommendedAction, selectedSession.recommendedActionReason); setSelectedSession(null); }}
                  >
                    {ACTION_LABELS[selectedSession.recommendedAction]?.name}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContextManagement;
