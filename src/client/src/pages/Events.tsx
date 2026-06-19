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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }}>
                  <div className="loading" style={{ margin: '0 auto' }} />
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  暂无数据
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id || event.sessionId}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{formatTime(event.timestamp)}</td>
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
                </tr>
              ))
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
