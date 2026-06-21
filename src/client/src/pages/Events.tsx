import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface AICodeEvent {
  id: string;
  sessionId: string;
  tool: string;
  modelId: string;
  tokenConsumption: {
    input: number;
    output: number;
    total: number;
  };
  performance: {
    latency: number;
    ttft?: number;
  };
  quality?: {
    errorType?: string;
    errorMessage?: string;
    codeAcceptance?: boolean;
  };
  timestamp: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}

// 全屏表格组件
function FullscreenTable({ children, title, isFullscreen, onToggle }: {
  children: React.ReactNode;
  title: string;
  isFullscreen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`${isFullscreen ? 'fullscreen-panel' : 'card-panel'}`} style={{ overflow: 'hidden' }}>
      <div className="panel-header">
        <div className="panel-title-wrapper">
          <span className="panel-indicator" />
          <span className="panel-title">{title}</span>
        </div>
        <button className="fullscreen-btn" onClick={onToggle} title={isFullscreen ? '退出全屏' : '全屏'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isFullscreen ? (
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            ) : (
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            )}
          </svg>
        </button>
      </div>
      <div className={`table-container ${isFullscreen ? 'fullscreen' : ''}`}>
        {children}
      </div>
      {isFullscreen && (
        <button className="fullscreen-close" onClick={onToggle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

function Events() {
  const [events, setEvents] = useState<AICodeEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ tool: '', search: '' });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null); // 展开的事件行 ID
  const [selectedEvent, setSelectedEvent] = useState<AICodeEvent | null>(null); // 弹窗详情

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      });
      if (filter.tool) params.append('tool', filter.tool);

      const response = await api.get<AICodeEvent[]>(
        `/api/events?${params}`
      );
      setEvents(response.data || []);
      setPagination((prev) => ({ ...prev, ...(response.pagination || {}) }));
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [pagination.page, filter.tool]);

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const formatDuration = (ms: number) => {
    if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
    return ms + 'ms';
  };

  const getToolBadgeClass = (tool: string) => {
    switch (tool) {
      case 'trae':
        return 'badge-success';
      case 'claude_code':
        return 'badge-warning';
      case 'cursor':
        return 'badge-error';
      default:
        return 'badge-success';
    }
  };

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

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
              <span className="title-main">事件列表</span>
              <span className="title-acop">EVENTS</span>
            </h1>
          </div>
          <div className="system-info">
            <span className="info-item">
              <span className="info-label">记录数</span>
              <span className="info-value">{pagination.total}</span>
            </span>
          </div>
        </div>
        <div className="header-right">
          <select
            value={filter.tool}
            onChange={(e) => setFilter((prev) => ({ ...prev, tool: e.target.value }))}
            style={{ width: '120px' }}
          >
            <option value="">全部工具</option>
            <option value="trae">Trae</option>
            <option value="claude_code">Claude Code</option>
            <option value="cursor">Cursor</option>
          </select>
          <button className="btn-refresh" onClick={fetchEvents}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 事件表格 */}
      <FullscreenTable
        title="事件日志"
        isFullscreen={isFullscreen}
        onToggle={toggleFullscreen}
      >
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>工具</th>
              <th>会话</th>
              <th>模型</th>
              <th>Token</th>
              <th>延迟</th>
              <th>状态</th>
              <th style={{ width: 80 }}>操作</th>
            </tr>
          </thead>
          <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                      <div className="loading" style={{ margin: '0 auto' }} />
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  events.map((event, index) => {
                    const eventId = event.id || `event-${index}`;
                    const isExpanded = expandedRowId === eventId;

                    return (
                      <>
                        <tr key={eventId} style={{ cursor: 'pointer', background: isExpanded ? 'rgba(0, 200, 255, 0.05)' : undefined }}
                            onClick={() => setExpandedRowId(isExpanded ? null : eventId)}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                            {isExpanded ? '▼' : '▶'} {formatTime(event.timestamp)}
                          </td>
                          <td>
                            <span className={`badge ${getToolBadgeClass(event.tool)}`}>
                              {event.tool}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'inherit', fontSize: '0.8rem' }}>
                            {event.sessionId.substring(0, 8)}...
                          </td>
                          <td style={{ fontFamily: 'inherit', fontSize: '0.8rem' }}>
                            {event.modelId}
                          </td>
                          <td>
                            <div style={{ fontSize: '0.8rem' }}>
                              <div>输入: {event.tokenConsumption.input.toLocaleString()}</div>
                              <div>输出: {event.tokenConsumption.output.toLocaleString()}</div>
                            </div>
                          </td>
                          <td>{formatDuration(event.performance.latency)}</td>
                          <td>
                            {event.quality?.errorType ? (
                              <span className="badge badge-error">{event.quality.errorType}</span>
                            ) : (
                              <span className="badge badge-success">正常</span>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                              onClick={() => setSelectedEvent(event)}
                            >
                              详情
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${eventId}-detail`}>
                            <td colSpan={8} style={{ padding: '1rem', background: 'rgba(0, 0, 0, 0.3)', borderTop: '1px solid rgba(0, 200, 255, 0.3)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                                {/* 基本信息 */}
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', background: 'rgba(0, 0, 0, 0.2)' }}>
                                  <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--accent-color)', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>📋 基本信息</h4>
                                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                                    <div><span style={{ color: 'var(--text-secondary)' }}>事件 ID：</span>{event.id || 'N/A'}</div>
                                    <div><span style={{ color: 'var(--text-secondary)' }}>会话 ID：</span>{event.sessionId}</div>
                                    <div><span style={{ color: 'var(--text-secondary)' }}>链路 ID：</span>{(event as any).traceId || 'N/A'}</div>
                                    <div><span style={{ color: 'var(--text-secondary)' }}>工具类型：</span>{event.tool}</div>
                                    <div><span style={{ color: 'var(--text-secondary)' }}>模型：</span>{event.modelId}</div>
                                    <div><span style={{ color: 'var(--text-secondary)' }}>时间：</span>{formatTime(event.timestamp)}</div>
                                  </div>
                                </div>

                                {/* Token 消耗 */}
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', background: 'rgba(0, 0, 0, 0.2)' }}>
                                  <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--accent-color)', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>🔢 Token 消耗</h4>
                                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                                    <div><span style={{ color: 'var(--text-secondary)' }}>输入：</span>{event.tokenConsumption.input.toLocaleString()}</div>
                                    <div><span style={{ color: 'var(--text-secondary)' }}>输出：</span>{event.tokenConsumption.output.toLocaleString()}</div>
                                    <div style={{ fontWeight: 'bold', color: 'var(--accent-color)', marginTop: '0.5rem' }}>总计：{event.tokenConsumption.total.toLocaleString()}</div>
                                  </div>
                                </div>

                                {/* 性能指标 */}
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', background: 'rgba(0, 0, 0, 0.2)' }}>
                                  <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--accent-color)', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>⚡ 性能指标</h4>
                                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                                    <div><span style={{ color: 'var(--text-secondary)' }}>延迟：</span>{formatDuration(event.performance.latency)}</div>
                                    {event.performance.ttft !== undefined && (
                                      <div><span style={{ color: 'var(--text-secondary)' }}>首 Token 时间：</span>{formatDuration(event.performance.ttft)}</div>
                                    )}
                                    {(event.performance as any).totalDuration !== undefined && (
                                      <div><span style={{ color: 'var(--text-secondary)' }}>总耗时：</span>{formatDuration((event.performance as any).totalDuration)}</div>
                                    )}
                                  </div>
                                </div>

                                {/* 质量指标 */}
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', background: 'rgba(0, 0, 0, 0.2)' }}>
                                  <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--accent-color)', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                                    {event.quality?.errorType ? '❌' : '✅'} 质量指标
                                  </h4>
                                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                                    {event.quality?.errorType ? (
                                      <>
                                        <div><span style={{ color: 'var(--text-secondary)' }}>错误类型：</span><span className="badge badge-error">{event.quality.errorType}</span></div>
                                        <div><span style={{ color: 'var(--text-secondary)' }}>错误信息：</span>{event.quality.errorMessage || 'N/A'}</div>
                                      </>
                                    ) : (
                                      <div style={{ color: 'var(--success-color)' }}>✨ 运行正常，无错误</div>
                                    )}
                                    {event.quality?.codeAcceptance !== undefined && (
                                      <div><span style={{ color: 'var(--text-secondary)' }}>代码接受：</span>{event.quality.codeAcceptance ? '✅ 是' : '❌ 否'}</div>
                                    )}
                                    {(event.quality as any)?.contextOverflow !== undefined && (
                                      <div><span style={{ color: 'var(--text-secondary)' }}>上下文溢出：</span>{(event.quality as any).contextOverflow ? '⚠️ 是' : '否'}</div>
                                    )}
                                  </div>
                                </div>

                                {/* 成本与元数据 */}
                                {(event as any).cost && (
                                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', background: 'rgba(0, 0, 0, 0.2)' }}>
                                    <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--accent-color)', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>💰 成本归因</h4>
                                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                                      <div><span style={{ color: 'var(--text-secondary)' }}>金额：</span>{(event as any).cost.amount} {(event as any).cost.currency}</div>
                                      {(event as any).cost.attribution && (
                                        <div><span style={{ color: 'var(--text-secondary)' }}>归属：</span>{(event as any).cost.attribution}</div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {(event as any).metadata && Object.keys((event as any).metadata).length > 0 && (
                                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', background: 'rgba(0, 0, 0, 0.2)' }}>
                                    <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--accent-color)', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>📝 元数据</h4>
                                    <div style={{ display: 'grid', gap: '0.5rem', wordBreak: 'break-all' }}>
                                      {Object.entries((event as any).metadata).map(([key, value]) => (
                                        <div key={key}><span style={{ color: 'var(--text-secondary)' }}>{key}：</span>{String(value)}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
        </table>
      </FullscreenTable>

      {/* 分页 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1rem',
          padding: '0.75rem 1rem',
          background: 'var(--bg-card)',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
        }}
      >
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          共 {pagination.total} 条记录，第 {pagination.page}/{Math.max(1, Math.ceil(pagination.total / pagination.pageSize))} 页
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary"
            disabled={pagination.page === 1}
            onClick={() => handlePageChange(pagination.page - 1)}
          >
            上一页
          </button>
          <button
            className="btn btn-secondary"
            disabled={pagination.page * pagination.pageSize >= pagination.total}
            onClick={() => handlePageChange(pagination.page + 1)}
          >
            下一页
          </button>
        </div>
      </div>

      {/* 全屏遮罩 */}
      {isFullscreen && <div className="fullscreen-overlay" onClick={() => setIsFullscreen(false)} />}

      {/* 事件详情弹窗 */}
      {selectedEvent && (
        <>
          <div className="modal-overlay" onClick={() => setSelectedEvent(null)} />
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <h2 className="modal-title">
                🔍 事件详情
                <span className="modal-subtitle">
                  {new Date(selectedEvent.timestamp).toLocaleString('zh-CN')} · {selectedEvent.tool}
                </span>
              </h2>
              <button className="btn btn-secondary" onClick={() => setSelectedEvent(null)}>关闭 ✕</button>
            </div>

            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                {/* 基本信息 */}
                <div className="detail-card">
                  <div className="detail-title">📋 基本信息</div>
                  <div className="detail-grid">
                    <div className="detail-row"><span className="detail-key">事件 ID</span><span className="detail-val">{selectedEvent.id || 'N/A'}</span></div>
                    <div className="detail-row"><span className="detail-key">会话 ID</span><span className="detail-val mono">{selectedEvent.sessionId}</span></div>
                    <div className="detail-row"><span className="detail-key">工具类型</span><span className="detail-val"><span className={`badge ${getToolBadgeClass(selectedEvent.tool)}`}>{selectedEvent.tool}</span></span></div>
                    <div className="detail-row"><span className="detail-key">模型</span><span className="detail-val mono">{selectedEvent.modelId}</span></div>
                    <div className="detail-row"><span className="detail-key">时间</span><span className="detail-val">{formatTime(selectedEvent.timestamp)}</span></div>
                  </div>
                </div>

                {/* Token 消耗 */}
                <div className="detail-card">
                  <div className="detail-title">🔢 Token 消耗</div>
                  <div className="detail-grid">
                    <div className="detail-row"><span className="detail-key">输入</span><span className="detail-val">{selectedEvent.tokenConsumption.input.toLocaleString()}</span></div>
                    <div className="detail-row"><span className="detail-key">输出</span><span className="detail-val">{selectedEvent.tokenConsumption.output.toLocaleString()}</span></div>
                    <div className="detail-row total"><span className="detail-key">总计</span><span className="detail-val" style={{ color: 'var(--accent-color)', fontWeight: 700 }}>{selectedEvent.tokenConsumption.total.toLocaleString()}</span></div>
                  </div>
                </div>

                {/* 性能指标 */}
                <div className="detail-card">
                  <div className="detail-title">⚡ 性能指标</div>
                  <div className="detail-grid">
                    <div className="detail-row"><span className="detail-key">延迟</span><span className="detail-val">{formatDuration(selectedEvent.performance.latency)}</span></div>
                    {selectedEvent.performance.ttft !== undefined && (
                      <div className="detail-row"><span className="detail-key">首 Token</span><span className="detail-val">{formatDuration(selectedEvent.performance.ttft)}</span></div>
                    )}
                    {(selectedEvent.performance as any).totalDuration !== undefined && (
                      <div className="detail-row"><span className="detail-key">总耗时</span><span className="detail-val">{formatDuration((selectedEvent.performance as any).totalDuration)}</span></div>
                    )}
                  </div>
                </div>

                {/* 质量指标 */}
                <div className="detail-card">
                  <div className="detail-title">{selectedEvent.quality?.errorType ? '❌' : '✅'} 质量指标</div>
                  <div className="detail-grid">
                    {selectedEvent.quality?.errorType ? (
                      <>
                        <div className="detail-row"><span className="detail-key">错误类型</span><span className="detail-val"><span className="badge badge-error">{selectedEvent.quality.errorType}</span></span></div>
                        <div className="detail-row"><span className="detail-key">错误信息</span><span className="detail-val">{selectedEvent.quality.errorMessage || 'N/A'}</span></div>
                      </>
                    ) : (
                      <div style={{ color: 'var(--success-color)', padding: '0.5rem 0' }}>✨ 运行正常，无错误</div>
                    )}
                    {selectedEvent.quality?.codeAcceptance !== undefined && (
                      <div className="detail-row"><span className="detail-key">代码接受</span><span className="detail-val">{selectedEvent.quality.codeAcceptance ? '✅ 是' : '❌ 否'}</span></div>
                    )}
                  </div>
                </div>

                {/* 成本归因 */}
                {(selectedEvent as any).cost && (
                  <div className="detail-card">
                    <div className="detail-title">💰 成本归因</div>
                    <div className="detail-grid">
                      <div className="detail-row"><span className="detail-key">金额</span><span className="detail-val">{(selectedEvent as any).cost.amount} {(selectedEvent as any).cost.currency}</span></div>
                      {(selectedEvent as any).cost.attribution && (
                        <div className="detail-row"><span className="detail-key">归属</span><span className="detail-val">{(selectedEvent as any).cost.attribution}</span></div>
                      )}
                    </div>
                  </div>
                )}

                {/* 元数据 */}
                {(selectedEvent as any).metadata && Object.keys((selectedEvent as any).metadata).length > 0 && (
                  <div className="detail-card" style={{ gridColumn: '1 / -1' }}>
                    <div className="detail-title">📝 元数据</div>
                    <div className="detail-grid" style={{ gridColumn: '1 / -1' }}>
                      {Object.entries((selectedEvent as any).metadata).map(([key, value]) => (
                        <div key={key} className="detail-row">
                          <span className="detail-key">{key}</span>
                          <span className="detail-val">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setSelectedEvent(null)}>关闭</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 脉冲指示器
function PulseIndicator({ active }: { active: boolean }) {
  return (
    <div className={`pulse-indicator ${active ? 'active' : 'inactive'}`}>
      <span className="pulse-dot" />
      <span className="pulse-ring" />
    </div>
  );
}

export default Events;
