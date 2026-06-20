import { useEffect, useState } from 'react';
import { api } from '../services/api';

type PromptType =
  | 'code_quality'
  | 'context_cleanup'
  | 'error_rate_reduction'
  | 'latency_optimization'
  | 'token_management';

type PromptStatus = 'generated' | 'reviewed' | 'applied' | 'dismissed';

interface PromptInjection {
  id: string;
  ruleId: string;
  ruleName: string;
  type: PromptType;
  title: string;
  content: string;
  summary: string;
  status: PromptStatus;
  generatedAt: number;
  updatedAt: number;
  appliedAt?: number;
  triggerContext?: {
    tokenUsage: number;
    errorRate: number;
    avgLatency: number;
    requestCount: number;
  };
}

interface PromptStats {
  total: number;
  byType: Record<PromptType, number>;
  byStatus: Record<PromptStatus, number>;
  recentlyGenerated: number;
}

const TYPE_LABELS: Record<PromptType, string> = {
  code_quality: '代码质量',
  context_cleanup: '上下文清理',
  error_rate_reduction: '错误率优化',
  latency_optimization: '延迟优化',
  token_management: 'Token 管理',
};

const TYPE_COLORS: Record<PromptType, string> = {
  code_quality: '#00ff88',
  context_cleanup: '#00f5ff',
  error_rate_reduction: '#ff6b35',
  latency_optimization: '#ffaa00',
  token_management: '#9966ff',
};

const STATUS_LABELS: Record<PromptStatus, string> = {
  generated: '🆕 新生成',
  reviewed: '👁️ 已查看',
  applied: '✅ 已应用',
  dismissed: '⛔ 忽略',
};

const STATUS_COLORS: Record<PromptStatus, string> = {
  generated: '#00f5ff',
  reviewed: '#ffaa00',
  applied: '#00ff88',
  dismissed: '#666',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { hour12: false });
}

export default function PromptInjections() {
  const [prompts, setPrompts] = useState<PromptInjection[]>([]);
  const [stats, setStats] = useState<PromptStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get<PromptInjection[]>('/api/prompt-injections'),
        api.get<PromptStats>('/api/prompt-injections/stats'),
      ]);
      setPrompts(listRes.data || []);
      setStats(statsRes.data || null);
    } catch (error) {
      console.error('加载提示注入列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (id: string, status: PromptStatus) => {
    try {
      await api.patch<PromptInjection>(`/api/prompt-injections/${id}/status`, { status });
      // 乐观更新
      setPrompts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status, updatedAt: Date.now(), appliedAt: status === 'applied' ? Date.now() : p.appliedAt } : p))
      );
      // 重新加载统计
      const statsRes = await api.get<PromptStats>('/api/prompt-injections/stats');
      setStats(statsRes.data || null);
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除此条提示？')) return;
    try {
      await api.delete(`/api/prompt-injections/${id}`);
      setPrompts((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const handleCopyContent = async (p: PromptInjection) => {
    try {
      await navigator.clipboard.writeText(p.content);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 2000);
      // 复制后自动标记为已查看
      if (p.status === 'generated') {
        handleStatusChange(p.id, 'reviewed');
      }
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  const filteredPrompts = prompts.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (typeFilter !== 'all' && p.type !== typeFilter) return false;
    return true;
  });

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* 头部 */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          💡 提示注入中心
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
          当规则触发时自动生成针对性 Prompt，可直接复制粘贴到 AI 工具对话中优化输出
        </p>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}>
          <div style={statCardStyle('#00f5ff')}>
            <div style={statLabel}>总数</div>
            <div style={statValue}>{stats.total}</div>
          </div>
          <div style={statCardStyle('#00ff88')}>
            <div style={statLabel}>已应用</div>
            <div style={statValue}>{stats.byStatus.applied || 0}</div>
          </div>
          <div style={statCardStyle('#ffaa00')}>
            <div style={statLabel}>待处理</div>
            <div style={statValue}>{(stats.byStatus.generated || 0) + (stats.byStatus.reviewed || 0)}</div>
          </div>
          <div style={statCardStyle('#9966ff')}>
            <div style={statLabel}>近 24 小时</div>
            <div style={statValue}>{stats.recentlyGenerated}</div>
          </div>
        </div>
      )}

      {/* 过滤器 */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
        marginBottom: '1rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>状态：</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">全部</option>
            <option value="generated">🆕 新生成</option>
            <option value="reviewed">👁️ 已查看</option>
            <option value="applied">✅ 已应用</option>
            <option value="dismissed">⛔ 忽略</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>类型：</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">全部</option>
            {(Object.keys(TYPE_LABELS) as PromptType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: 'auto' }}>
          显示 {filteredPrompts.length} / {prompts.length} 条
        </div>
        <button onClick={loadData} style={buttonStyle}>刷新</button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{ color: 'var(--text-secondary)', padding: '3rem', textAlign: 'center' }}>
          加载中...
        </div>
      ) : filteredPrompts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          border: '1px dashed var(--border-color)',
          borderRadius: '8px',
          color: 'var(--text-secondary)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💡</div>
          <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            暂无提示注入记录
          </div>
          <div style={{ fontSize: '0.9rem' }}>
            当规则触发时，系统会自动生成针对性的优化提示
          </div>
          <div style={{ fontSize: '0.85rem', marginTop: '1rem', color: 'var(--text-secondary)' }}>
            可以前往「规则管理」手动测试触发规则
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredPrompts.map((p) => {
            const isExpanded = expandedId === p.id;
            const typeColor = TYPE_COLORS[p.type];
            const statusColor = STATUS_COLORS[p.status];
            return (
              <div
                key={p.id}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-secondary)',
                  overflow: 'hidden',
                }}
              >
                {/* 头部摘要行 */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  style={{
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <span style={{
                    display: 'inline-block',
                    width: 4,
                    height: '24px',
                    backgroundColor: typeColor,
                    borderRadius: '2px',
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                      {p.title}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      来自规则「{p.ruleName}」 · {formatDate(p.generatedAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '3px 8px',
                      borderRadius: '3px',
                      backgroundColor: `${typeColor}20`,
                      color: typeColor,
                      border: `1px solid ${typeColor}40`,
                    }}>
                      {TYPE_LABELS[p.type]}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '3px 8px',
                      borderRadius: '3px',
                      backgroundColor: `${statusColor}20`,
                      color: statusColor,
                      border: `1px solid ${statusColor}40`,
                    }}>
                      {STATUS_LABELS[p.status]}
                    </span>
                    <span style={{
                      color: isExpanded ? 'var(--primary-color)' : 'var(--text-secondary)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      fontSize: '0.8rem',
                    }}>▼</span>
                  </div>
                </div>

                {/* 展开的详细内容 */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid var(--border-color)',
                    padding: '1.25rem',
                    backgroundColor: 'rgba(0, 30, 40, 0.3)',
                  }}>
                    {/* 摘要 */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        📋 摘要
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        {p.summary}
                      </div>
                    </div>

                    {/* 触发上下文 */}
                    {p.triggerContext && (
                      <div style={{
                        display: 'flex',
                        gap: '1.5rem',
                        padding: '0.75rem',
                        backgroundColor: 'rgba(0, 245, 255, 0.05)',
                        borderRadius: '4px',
                        marginBottom: '1rem',
                        flexWrap: 'wrap',
                      }}>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Token 用量</div>
                          <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>
                            {p.triggerContext.tokenUsage.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>错误率</div>
                          <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>
                            {p.triggerContext.errorRate}%
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>平均延迟</div>
                          <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>
                            {(p.triggerContext.avgLatency / 1000).toFixed(1)}s
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>请求次数</div>
                          <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>
                            {p.triggerContext.requestCount}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Prompt 内容 */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <span>📝 提示内容（可直接复制）</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyContent(p);
                          }}
                          style={{
                            fontSize: '0.75rem',
                            padding: '3px 10px',
                            backgroundColor: copiedId === p.id ? 'rgba(0, 255, 136, 0.15)' : 'var(--primary-color)',
                            color: copiedId === p.id ? '#00ff88' : '#001510',
                            border: copiedId === p.id ? '1px solid #00ff8840' : 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                        >
                          {copiedId === p.id ? '✓ 已复制' : '📋 复制内容'}
                        </button>
                      </div>
                      <pre style={{
                        backgroundColor: '#0a0f14',
                        color: '#e0f0f8',
                        padding: '1rem',
                        borderRadius: '4px',
                        fontSize: '0.82rem',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: 0,
                        border: '1px solid var(--border-color)',
                        maxHeight: '400px',
                        overflowY: 'auto',
                        fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                      }}>
                        {p.content}
                      </pre>
                    </div>

                    {/* 操作按钮 */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {p.status !== 'applied' && (
                        <button
                          onClick={() => handleStatusChange(p.id, 'applied')}
                          style={{ ...actionButtonStyle, backgroundColor: 'rgba(0, 255, 136, 0.15)', color: '#00ff88', borderColor: '#00ff8840' }}
                        >
                          ✅ 标记为已应用
                        </button>
                      )}
                      {p.status === 'generated' && (
                        <button
                          onClick={() => handleStatusChange(p.id, 'reviewed')}
                          style={{ ...actionButtonStyle, backgroundColor: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00', borderColor: '#ffaa0040' }}
                        >
                          👁️ 标记为已查看
                        </button>
                      )}
                      {p.status !== 'dismissed' && (
                        <button
                          onClick={() => handleStatusChange(p.id, 'dismissed')}
                          style={{ ...actionButtonStyle, backgroundColor: 'rgba(128, 128, 128, 0.15)', color: '#888', borderColor: '#88888840' }}
                        >
                          ⛔ 忽略此条
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(p.id)}
                        style={{ ...actionButtonStyle, backgroundColor: 'rgba(255, 51, 102, 0.15)', color: '#ff3366', borderColor: '#ff336640' }}
                      >
                        🗑️ 删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 样式 helpers
const statCardStyle = (color: string) => ({
  padding: '1rem',
  border: `1px solid ${color}40`,
  borderRadius: '6px',
  backgroundColor: `${color}10`,
});

const statLabel = {
  color: 'var(--text-secondary)',
  fontSize: '0.75rem',
  marginBottom: '0.35rem',
};

const statValue = {
  color: 'var(--text-primary)',
  fontSize: '1.75rem',
  fontWeight: 700,
};

const selectStyle: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  fontSize: '0.85rem',
  cursor: 'pointer',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.4rem 1rem',
  backgroundColor: 'var(--primary-color)',
  color: '#001510',
  border: 'none',
  borderRadius: '4px',
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontWeight: 500,
};

const actionButtonStyle: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  border: '1px solid',
  borderRadius: '4px',
  fontSize: '0.82rem',
  cursor: 'pointer',
  fontWeight: 500,
  transition: 'all 0.15s ease',
};
