import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { api } from '../services/api';
import { useToast, createToastApi, ToastContainer } from '../hooks/useToast';

interface DashboardStats {
  totalTokens: number;
  totalRequests: number;
  avgLatency: number;
  errorRate: number;
  totalCost: number;
  activeSessions: number;
}

interface TokenTrend {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface ErrorDistribution {
  errorType: string;
  count: number;
  percentage: number;
}

interface ToolUsage {
  tool: string;
  requestCount: number;
  totalTokens: number;
  avgLatency: number;
  errorRate: number;
}

const COLORS = ['#00f5ff', '#00ff88', '#ff6b35', '#ff3366'];

// 周期选项
const TIME_RANGES = [
  { value: 7, label: '近7天' },
  { value: 14, label: '近14天' },
];

// 自定义日期范围类型
type DateRange = {
  type: 'preset';
  days: number;
} | {
  type: 'custom';
  startDate: string;
  endDate: string;
};

// 全屏组件
function FullscreenPanel({ children, title, isFullscreen, onToggle }: {
  children: React.ReactNode;
  title: string;
  isFullscreen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`${isFullscreen ? 'fullscreen-panel' : 'card-panel'}`}>
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
      <div className="panel-content">
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

// 迷你统计卡片
function MiniStatCard({ icon, label, value, change, trend }: {
  icon: string;
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
}) {
  return (
    <div className="mini-stat-card">
      <div className="mini-stat-icon">{icon}</div>
      <div className="mini-stat-content">
        <div className="mini-stat-value">{value}</div>
        <div className="mini-stat-label">{label}</div>
      </div>
      <div className={`mini-stat-change ${trend}`}>
        <span className="trend-arrow">{trend === 'up' ? '↑' : '↓'}</span>
        <span>{change}</span>
      </div>
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

// 周期选择器（支持自定义日期）
function TimeRangeSelector({ value, onChange, onCustomOpen }: {
  value: DateRange;
  onChange: (days: number) => void;
  onCustomOpen: () => void;
}) {
  const isCustom = value.type === 'custom';
  return (
    <div className="time-range-selector">
      {TIME_RANGES.map((range) => (
        <button
          key={range.value}
          className={`time-range-btn ${value.type === 'preset' && value.days === range.value ? 'active' : ''}`}
          onClick={() => onChange(range.value)}
        >
          {range.label}
        </button>
      ))}
      <button
        className={`time-range-btn time-range-custom ${isCustom ? 'active' : ''}`}
        onClick={onCustomOpen}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {isCustom ? `${value.startDate} 至 ${value.endDate}` : '自定义'}
      </button>
    </div>
  );
}

// 自定义日期选择器弹窗
function CustomDatePicker({ value, onApply, onClose, showError }: {
  value: { startDate: string; endDate: string };
  onApply: (startDate: string, endDate: string) => void;
  onClose: () => void;
  showError: (msg: string) => void;
}) {
  const [startDate, setStartDate] = useState(value.startDate);
  const [endDate, setEndDate] = useState(value.endDate);

  const handleApply = () => {
    if (startDate && endDate) {
      if (startDate > endDate) {
        showError('起始日期不能晚于结束日期');
        return;
      }
      onApply(startDate, endDate);
      onClose();
    } else {
      showError('请选择完整的日期范围');
    }
  };

  return (
    <div className="date-picker-overlay" onClick={onClose}>
      <div className="date-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="date-picker-header">
          <span>自定义日期范围</span>
          <button className="date-picker-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="date-picker-body">
          <div className="date-input-group">
            <label>起始日期</label>
            <input
              type="date"
              value={startDate}
              max={endDate || new Date().toISOString().split('T')[0]}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="date-range-arrow">→</div>
          <div className="date-input-group">
            <label>结束日期</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="date-picker-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleApply}>应用</button>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tokenTrend, setTokenTrend] = useState<TokenTrend[]>([]);
  const [errorDistribution, setErrorDistribution] = useState<ErrorDistribution[]>([]);
  const [toolUsage, setToolUsage] = useState<ToolUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [time, setTime] = useState(new Date());
  const [timeRange, setTimeRange] = useState<DateRange>({ type: 'preset', days: 7 });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { toasts, showToast, removeToast: removeToastToast } = useToast();
  const toast = createToastApi(showToast);

  // 辅助函数：生成查询参数
  const getQueryParams = () => {
    if (timeRange.type === 'preset') {
      return `days=${timeRange.days}`;
    }
    return `startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const queryParams = getQueryParams();
      const [statsRes, trendRes, errorRes, toolRes] = await Promise.all([
        api.get<DashboardStats>(`/api/dashboard/stats?${queryParams}`),
        api.get<TokenTrend[]>(`/api/dashboard/token-trend?${queryParams}`),
        api.get<ErrorDistribution[]>(`/api/dashboard/error-distribution?${queryParams}`),
        api.get<ToolUsage[]>(`/api/dashboard/tool-usage?${queryParams}`),
      ]);

      setStats(statsRes.data || {
        totalTokens: 0,
        totalRequests: 0,
        avgLatency: 0,
        errorRate: 0,
        totalCost: 0,
        activeSessions: 0,
      });
      setTokenTrend(trendRes.data || []);
      setErrorDistribution(errorRes.data || []);
      setToolUsage(toolRes.data || []);
      setLastUpdate(new Date());
      toast.success(`数据已更新 (${new Date().toLocaleTimeString()})`);
    } catch (error) {
      console.error('获取看板数据失败:', error);
      toast.error('获取看板数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [timeRange]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(0);
  };

  const formatCost = (cost: number) => {
    return '¥' + cost.toFixed(2);
  };

  const toggleFullscreen = useCallback((panelId: string) => {
    setActivePanel(prev => prev === panelId ? null : panelId);
  }, []);

  const handleTimeRangeChange = (days: number) => {
    setTimeRange({ type: 'preset', days });
  };

  const handleCustomRange = (startDate: string, endDate: string) => {
    setTimeRange({ type: 'custom', startDate, endDate });
  };

  const getDefaultCustomDates = () => {
    if (timeRange.type === 'custom') {
      return { startDate: timeRange.startDate, endDate: timeRange.endDate };
    }
    const today = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 14);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    return { startDate: formatDate(twoWeeksAgo), endDate: formatDate(today) };
  };

  if (loading) {
    return (
      <div className="page">
        <div className="loading-container">
          <div className="cyber-loader">
            <div className="cyber-ring" />
            <div className="cyber-ring" />
            <div className="cyber-ring" />
          </div>
          <div className="loading-text">正在加载<span className="loading-dots" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page dashboard-page">
      {/* 背景网格效果 */}
      <div className="bg-grid" />
      <div className="bg-glow" />

      {/* 页面头部 */}
      <div className="page-header">
        <div className="header-left">
          <div className="title-wrapper">
            <PulseIndicator active={true} />
            <h1 className="page-title">
              <span className="title-main">知墟</span>
              <span className="title-acop">ACOP</span>
            </h1>
          </div>
          <div className="system-info">
            <span className="info-item">
              <span className="info-label">状态</span>
              <span className="info-value">运行中</span>
            </span>
            <span className="info-divider">|</span>
            <span className="info-item">
              <span className="info-label">时间</span>
              <span className="info-value">{time.toLocaleTimeString()}</span>
            </span>
          </div>
        </div>
        <div className="header-right">
          <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} onCustomOpen={() => setShowDatePicker(true)} />
          <span className="update-time">
            <span className="update-label">最后同步</span>
            <span className="update-value">{lastUpdate.toLocaleTimeString()}</span>
          </span>
          <button className="btn-refresh" onClick={fetchData}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 统计卡片 - 迷你版 */}
      <div className="stats-grid">
        <MiniStatCard
          icon="◈"
          label="Token 总消耗"
          value={formatNumber(stats?.totalTokens || 0)}
          change="12.5%"
          trend="up"
        />
        <MiniStatCard
          icon="◐"
          label="平均延迟"
          value={`${(stats?.avgLatency || 0).toFixed(0)}ms`}
          change="5.2%"
          trend="up"
        />
        <MiniStatCard
          icon="◓"
          label="错误率"
          value={`${(stats?.errorRate || 0).toFixed(1)}%`}
          change="0.3%"
          trend="down"
        />
        <MiniStatCard
          icon="◒"
          label="总成本"
          value={formatCost(stats?.totalCost || 0)}
          change="8.2%"
          trend="up"
        />
      </div>

      {/* 图表区域 */}
      <div className="charts-grid">
        {/* Token 消耗趋势 */}
        <FullscreenPanel
          title="Token 消耗趋势"
          isFullscreen={activePanel === 'token'}
          onToggle={() => toggleFullscreen('token')}
        >
          <div style={{ height: activePanel === 'token' ? 'calc(100vh - 200px)' : '280px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tokenTrend}>
                <defs>
                  <linearGradient id="inputGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f5ff" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#00f5ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00ff88" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3a4a" />
                <XAxis dataKey="date" stroke="#4a6a7a" fontSize={11} tickLine={false} />
                <YAxis stroke="#4a6a7a" fontSize={11} tickLine={false} tickFormatter={formatNumber} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(10, 20, 30, 0.95)',
                    border: '1px solid #00f5ff',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#00f5ff' }}
                  formatter={(value: number) => [value.toLocaleString(), '']}
                />
                <Line
                  type="monotone"
                  dataKey="inputTokens"
                  stroke="#00f5ff"
                  strokeWidth={2}
                  dot={false}
                  name="输入"
                  activeDot={{ r: 6, fill: '#00f5ff' }}
                />
                <Line
                  type="monotone"
                  dataKey="outputTokens"
                  stroke="#00ff88"
                  strokeWidth={2}
                  dot={false}
                  name="输出"
                  activeDot={{ r: 6, fill: '#00ff88' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </FullscreenPanel>

        {/* 错误类型分布 */}
        <FullscreenPanel
          title="错误分布"
          isFullscreen={activePanel === 'error'}
          onToggle={() => toggleFullscreen('error')}
        >
          <div style={{ height: activePanel === 'error' ? 'calc(100vh - 200px)' : '280px', display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="45%" height="100%">
              <PieChart>
                <Pie
                  data={errorDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={activePanel === 'error' ? 80 : 50}
                  outerRadius={activePanel === 'error' ? 120 : 80}
                  paddingAngle={3}
                  dataKey="count"
                >
                  {errorDistribution.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      style={{ filter: `drop-shadow(0 0 8px ${COLORS[index % COLORS.length]})` }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="error-legend">
              {errorDistribution.map((item, index) => (
                <div key={item.errorType} className="legend-item">
                  <span className="legend-dot" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="legend-label">{item.errorType}</span>
                  <span className="legend-value">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </FullscreenPanel>

        {/* 工具使用统计 - 全宽 */}
        <FullscreenPanel
          title="工具使用统计"
          isFullscreen={activePanel === 'tool'}
          onToggle={() => toggleFullscreen('tool')}
        >
          <div style={{ height: activePanel === 'tool' ? 'calc(100vh - 200px)' : '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={toolUsage}>
                <defs>
                  <linearGradient id="barGradient1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f5ff" />
                    <stop offset="100%" stopColor="#0088aa" />
                  </linearGradient>
                  <linearGradient id="barGradient2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff6b35" />
                    <stop offset="100%" stopColor="#cc4422" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3a4a" />
                <XAxis dataKey="tool" stroke="#4a6a7a" fontSize={11} tickLine={false} />
                <YAxis yAxisId="left" stroke="#4a6a7a" fontSize={11} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#4a6a7a" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(10, 20, 30, 0.95)',
                    border: '1px solid #00f5ff',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                />
                <Bar yAxisId="left" dataKey="requestCount" fill="url(#barGradient1)" name="请求数" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="avgLatency" fill="url(#barGradient2)" name="延迟(ms)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FullscreenPanel>
      </div>

      {/* 全屏遮罩 */}
      {activePanel && <div className="fullscreen-overlay" onClick={() => setActivePanel(null)} />}

      {/* 自定义日期选择器 */}
      {showDatePicker && (
        <CustomDatePicker
          value={getDefaultCustomDates()}
          onApply={handleCustomRange}
          onClose={() => setShowDatePicker(false)}
          showError={(msg) => toast.error(msg)}
        />
      )}

      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToastToast} />
    </div>
  );
}

export default Dashboard;
