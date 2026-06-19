import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast, createToastApi, ToastContainer } from '../hooks/useToast';

interface Rule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  condition: {
    type: string;
    threshold: number;
    operator: string;
  };
  action: {
    type: string;
    config: Record<string, unknown>;
  };
  priority: 'low' | 'medium' | 'high';
}

// ========== 条件/动作的选项配置 ==========
const CONDITION_TYPES = [
  { value: 'token_threshold', label: 'Token 使用率阈值', placeholder: '0-1 之间，如 0.8' },
  { value: 'token_consumption', label: 'Token 消耗量阈值', placeholder: '整数，如 100000' },
  { value: 'error_rate', label: '错误率阈值', placeholder: '0-100 之间，如 5' },
  { value: 'latency_threshold', label: '延迟阈值(ms)', placeholder: '整数，如 5000' },
];

const OPERATORS = [
  { value: '>', label: '大于 (>)' },
  { value: '>=', label: '大于等于 (>=)' },
  { value: '<', label: '小于 (<)' },
  { value: '<=', label: '小于等于 (<=)' },
];

const ACTION_TYPES = [
  { value: 'clear_context', label: '清理上下文缓存' },
  { value: 'send_alert', label: '发送告警通知' },
  { value: 'inject_prompt', label: '注入提示语' },
  { value: 'route_model', label: '切换模型路由' },
];

// ========== 脉冲指示器 ==========
function PulseIndicator({ active }: { active: boolean }) {
  return (
    <div className={`pulse-indicator ${active ? 'active' : 'inactive'}`}>
      <span className="pulse-dot" />
      <span className="pulse-ring" />
    </div>
  );
}

// ========== 规则卡片 ==========
function RuleCard({
  rule,
  onToggle,
  onTrigger,
  onEdit,
  onDelete,
}: {
  rule: Rule;
  onToggle: () => void;
  onTrigger: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const getPriorityClass = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'badge-error';
      case 'medium':
        return 'badge-warning';
      case 'low':
        return 'badge-success';
      default:
        return 'badge-success';
    }
  };

  const getConditionLabel = () => {
    const { type, threshold, operator } = rule.condition;
    switch (type) {
      case 'token_threshold':
        if (threshold < 1) return `Token 使用率 ${operator} ${(threshold * 100).toFixed(0)}%`;
        return `Token 消耗 ${operator} ${threshold.toLocaleString()}`;
      case 'token_consumption':
        return `Token 消耗 ${operator} ${threshold.toLocaleString()}`;
      case 'error_rate':
        return `错误率 ${operator} ${threshold}%`;
      case 'latency_threshold':
        return `延迟 ${operator} ${threshold}ms`;
      default:
        return `${type} ${operator} ${threshold}`;
    }
  };

  const getActionLabel = () => {
    switch (rule.action.type) {
      case 'clear_context':
        return '清理上下文';
      case 'send_alert':
        return '发送告警';
      case 'inject_prompt':
        return '注入提示';
      case 'route_model':
        return '切换模型';
      default:
        return rule.action.type;
    }
  };

  return (
    <div className="rule-card">
      <div className="rule-header">
        <div className="rule-title-section">
          <h3 className="rule-name">{rule.name}</h3>
          <p className="rule-desc">{rule.description}</p>
        </div>
        <div className="rule-actions">
          <span className={`badge ${getPriorityClass(rule.priority)}`}>
            {rule.priority === 'high' ? '高' : rule.priority === 'medium' ? '中' : '低'}
          </span>
          <label className="toggle-switch">
            <input type="checkbox" checked={rule.enabled} onChange={onToggle} />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="rule-body">
        <div className="rule-condition">
          <span className="rule-label">触发条件</span>
          <span className="rule-value">{getConditionLabel()}</span>
        </div>
        <div className="rule-action">
          <span className="rule-label">执行动作</span>
          <span className="rule-value">{getActionLabel()}</span>
        </div>
      </div>

      <div className="rule-footer">
        <button className="btn btn-secondary" onClick={onEdit}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          编辑
        </button>
        <button className="rule-card-delete" onClick={onDelete}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
          删除
        </button>
        <button className="btn btn-primary" onClick={onTrigger}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          测试
        </button>
      </div>
    </div>
  );
}

// ========== 规则表单弹窗 ==========
function RuleModal({
  rule,
  onClose,
  onSubmit,
}: {
  rule: Rule | null;
  onClose: () => void;
  onSubmit: (rule: Omit<Rule, 'id'> | Rule) => Promise<void>;
}) {
  const isEdit = !!rule?.id;

  const [name, setName] = useState(rule?.name ?? '');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(rule?.priority ?? 'medium');
  const [conditionType, setConditionType] = useState(rule?.condition?.type ?? 'token_threshold');
  const [threshold, setThreshold] = useState<string>(String(rule?.condition?.threshold ?? ''));
  const [operator, setOperator] = useState(rule?.condition?.operator ?? '>');
  const [actionType, setActionType] = useState(rule?.action?.type ?? 'send_alert');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (threshold === '' || isNaN(Number(threshold))) return;

    setSaving(true);
    const payload: Omit<Rule, 'id'> | Rule = {
      ...(isEdit ? { id: (rule as Rule).id } : {}),
      name: name.trim(),
      description: description.trim(),
      enabled,
      priority,
      condition: {
        type: conditionType,
        threshold: Number(threshold),
        operator,
      },
      action: {
        type: actionType,
        config: {},
      },
    };
    try {
      await onSubmit(payload);
    } finally {
      setSaving(false);
    }
  };

  const currentConditionHint = CONDITION_TYPES.find((c) => c.value === conditionType);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <PulseIndicator active={true} />
            <span>{isEdit ? '编辑规则' : '新增规则'}</span>
            <span className="modal-title-accent">{isEdit ? 'EDIT' : 'CREATE'}</span>
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="form-section">
            <div className="form-section-title">基本信息</div>
            <div className="form-group">
              <label>规则名称</label>
              <input
                type="text"
                placeholder="例如：上下文清理预警"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>描述说明</label>
              <textarea
                placeholder="简要描述该规则的用途..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>优先级</label>
              <div className="priority-picker">
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <div
                    key={p}
                    className={`priority-option ${priority === p ? `active-${p}` : ''}`}
                    onClick={() => setPriority(p)}
                  >
                    {p === 'high' ? '高' : p === 'medium' ? '中' : '低'}
                  </div>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  style={{ marginRight: '0.375rem' }}
                />
                创建后启用该规则
              </label>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">触发条件</div>
            <div className="form-grid-2">
              <div className="form-group">
                <label>条件类型</label>
                <select value={conditionType} onChange={(e) => setConditionType(e.target.value)}>
                  {CONDITION_TYPES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>比较运算符</label>
                <select value={operator} onChange={(e) => setOperator(e.target.value)}>
                  {OPERATORS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>阈值</label>
              <input
                type="number"
                step="any"
                placeholder={currentConditionHint?.placeholder ?? '请输入阈值'}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
              <span className="form-hint">
                {conditionType === 'token_threshold'
                  ? '使用 0-1 的小数表示百分比（如 0.8 = 80%）'
                  : conditionType === 'error_rate'
                    ? '使用 0-100 的百分比'
                    : conditionType === 'latency_threshold'
                      ? '单位为毫秒'
                      : '整数'}
              </span>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">执行动作</div>
            <div className="form-group">
              <label>动作类型</label>
              <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
                {ACTION_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <span className="form-hint">
                {actionType === 'send_alert'
                  ? '规则触发时将通过告警配置中的钉钉/邮件/Webhook 通道发送通知'
                  : actionType === 'clear_context'
                    ? '将清理 AI 助手的会话上下文，降低 token 累积'
                    : actionType === 'inject_prompt'
                      ? '将注入预设提示词到对话流中'
                      : '将请求路由到备用模型'}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !name.trim()}>
            {saving ? '保存中...' : isEdit ? '保存修改' : '创建规则'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== 删除确认弹窗 ==========
function ConfirmDeleteModal({
  rule,
  onClose,
  onConfirm,
}: {
  rule: Rule | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  if (!rule) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ color: 'var(--error-color)' }}>⚠</span>
            <span>删除确认</span>
            <span className="modal-title-accent">DELETE</span>
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="delete-confirm-text">
            您确定要<strong>永久删除</strong>以下规则吗？该操作无法撤销。
          </p>
          <span className="confirm-rule-name">{rule.name}</span>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={deleting}>
            取消
          </button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={deleting}>
            {deleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== 主组件 ==========
function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingRule, setDeletingRule] = useState<Rule | null>(null);
  const { toasts, showToast, removeToast } = useToast();
  const toast = createToastApi(showToast);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const response = await api.get<Rule[]>('/api/rules');
      setRules(response.data || []);
    } catch (error) {
      console.error('Failed to fetch rules:', error);
      toast.error('加载规则列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const toggleRule = async (rule: Rule) => {
    try {
      await api.put(`/api/rules/${rule.id}`, { ...rule, enabled: !rule.enabled });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
      toast.success(!rule.enabled ? '规则已启用' : '规则已禁用');
    } catch (error) {
      console.error('Failed to toggle rule:', error);
      toast.error('更新规则状态失败');
    }
  };

  const triggerRule = async (ruleId: string) => {
    try {
      await api.post(`/api/rules/${ruleId}/trigger`);
      toast.success('规则触发成功，告警已发送');
    } catch (error) {
      console.error('Failed to trigger rule:', error);
      toast.error('规则触发失败，请检查告警配置');
    }
  };

  const handleSubmit = async (payload: Omit<Rule, 'id'> | Rule) => {
    try {
      if ('id' in payload && payload.id) {
        // 编辑
        await api.put(`/api/rules/${payload.id}`, payload);
        setRules((prev) => prev.map((r) => (r.id === payload.id ? (payload as Rule) : r)));
        toast.success('规则已更新');
        setEditingRule(null);
      } else {
        // 新建
        const response = await api.post<Rule>('/api/rules', payload);
        if (response.data) {
          setRules((prev) => [...prev, response.data]);
          toast.success('规则创建成功');
        }
        setCreating(false);
      }
    } catch (error) {
      console.error('Submit failed:', error);
      toast.error('保存规则失败，请检查输入');
    }
  };

  const handleDelete = async () => {
    if (!deletingRule) return;
    try {
      await api.delete(`/api/rules/${deletingRule.id}`);
      setRules((prev) => prev.filter((r) => r.id !== deletingRule.id));
      toast.success('规则已删除');
      setDeletingRule(null);
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('删除规则失败');
    }
  };

  const activeRules = rules.filter((r) => r.enabled).length;
  const totalRules = rules.length;

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
              <span className="title-main">规则管理</span>
              <span className="title-acop">RULES</span>
            </h1>
          </div>
          <div className="system-info">
            <span className="info-item">
              <span className="info-label">启用中</span>
              <span className="info-value">
                {activeRules}/{totalRules}
              </span>
            </span>
          </div>
        </div>
        <div className="header-right">
          <button className="btn-refresh" onClick={fetchRules}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>刷新</span>
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新增规则
          </button>
        </div>
      </div>

      {/* 规则列表 */}
      <div className="rules-grid">
        {loading ? (
          <div className="loading-container">
            <div className="cyber-loader">
              <div className="cyber-ring" />
              <div className="cyber-ring" />
              <div className="cyber-ring" />
            </div>
          </div>
        ) : rules.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>暂无规则，点击「新增规则」创建第一条</p>
          </div>
        ) : (
          rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={() => toggleRule(rule)}
              onTrigger={() => triggerRule(rule.id)}
              onEdit={() => setEditingRule(rule)}
              onDelete={() => setDeletingRule(rule)}
            />
          ))
        )}
      </div>

      {/* 弹窗 */}
      {creating && (
        <RuleModal
          rule={null}
          onClose={() => setCreating(false)}
          onSubmit={handleSubmit}
        />
      )}
      {editingRule && (
        <RuleModal
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSubmit={handleSubmit}
        />
      )}
      {deletingRule && (
        <ConfirmDeleteModal
          rule={deletingRule}
          onClose={() => setDeletingRule(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* Toast */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default Rules;
