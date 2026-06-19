import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast, createToastApi, ToastContainer } from '../hooks/useToast';

interface AlertConfig {
  enabled: boolean;
  channels: {
    dingtalk: {
      enabled: boolean;
      webhookUrl: string;
      secret: string;
    };
    email: {
      enabled: boolean;
      smtpServer: string;
      smtpPort: number;
      username: string;
      password: string;
      toEmails: string;
    };
    webhook: {
      enabled: boolean;
      url: string;
      secret: string;
      headers: Record<string, string>;
    };
  };
  rules: {
    tokenThreshold: number;
    errorRateThreshold: number;
    latencyThreshold: number;
  };
}

interface OtelConfig {
  endpoint: string;
  serviceName: string;
}

interface UIConfig {
  refreshInterval: number;
  theme: 'dark' | 'light';
}

function Settings() {
  const { toasts, showToast, removeToast } = useToast();
  const toast = createToastApi(showToast);

  // OpenTelemetry 配置
  const [otelConfig, setOtelConfig] = useState<OtelConfig>({
    endpoint: 'http://localhost:4318',
    serviceName: 'zhixu-server',
  });

  // 告警配置
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    enabled: true,
    channels: {
      dingtalk: {
        enabled: true,
        webhookUrl: '',
        secret: '',
      },
      email: {
        enabled: false,
        smtpServer: '',
        smtpPort: 587,
        username: '',
        password: '',
        toEmails: '',
      },
      webhook: {
        enabled: false,
        url: '',
        secret: '',
        headers: {},
      },
    },
    rules: {
      tokenThreshold: 100000,
      errorRateThreshold: 5,
      latencyThreshold: 5000,
    },
  });

  // 界面配置
  const [uiConfig, setUiConfig] = useState<UIConfig>({
    refreshInterval: 30,
    theme: 'dark',
  });

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingDingtalk, setSendingDingtalk] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingWebhook, setSendingWebhook] = useState(false);
  const [activeTab, setActiveTab] = useState<'otel' | 'alert' | 'ui'>('alert');

  // 加载配置
  useEffect(() => {
    const savedOtel = localStorage.getItem('zhixu-otel-config');
    const savedAlert = localStorage.getItem('zhixu-alert-config');
    const savedUI = localStorage.getItem('zhixu-ui-config');

    if (savedOtel) setOtelConfig(JSON.parse(savedOtel));
    if (savedAlert) setAlertConfig(JSON.parse(savedAlert));
    if (savedUI) setUiConfig(JSON.parse(savedUI));
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      localStorage.setItem('zhixu-otel-config', JSON.stringify(otelConfig));
      localStorage.setItem('zhixu-alert-config', JSON.stringify(alertConfig));
      localStorage.setItem('zhixu-ui-config', JSON.stringify(uiConfig));
      setSaved(true);
      toast.success('配置已保存');
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      toast.error('保存配置失败');
      console.error('保存配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveEmailConfig = () => {
    localStorage.setItem('zhixu-alert-config', JSON.stringify(alertConfig));
    toast.success('邮箱配置已保存');
  };

  const clearEmailConfig = () => {
    setAlertConfig(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        email: {
          enabled: false,
          smtpServer: '',
          smtpPort: 587,
          username: '',
          password: '',
          toEmails: '',
        },
      },
    }));
    localStorage.setItem('zhixu-alert-config', JSON.stringify({
      ...alertConfig,
      channels: {
        ...alertConfig.channels,
        email: {
          enabled: false,
          smtpServer: '',
          smtpPort: 587,
          username: '',
          password: '',
          toEmails: '',
        },
      },
    }));
    toast.info('邮箱配置已清空');
  };

  const saveDingtalkConfig = () => {
    localStorage.setItem('zhixu-alert-config', JSON.stringify(alertConfig));
    toast.success('钉钉配置已保存');
  };

  const clearDingtalkConfig = () => {
    setAlertConfig(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        dingtalk: {
          enabled: false,
          webhookUrl: '',
          secret: '',
        },
      },
    }));
    localStorage.setItem('zhixu-alert-config', JSON.stringify({
      ...alertConfig,
      channels: {
        ...alertConfig.channels,
        dingtalk: {
          enabled: false,
          webhookUrl: '',
          secret: '',
        },
      },
    }));
    toast.info('钉钉配置已清空');
  };

  const saveWebhookConfig = () => {
    localStorage.setItem('zhixu-alert-config', JSON.stringify(alertConfig));
    toast.success('Webhook配置已保存');
  };

  const clearWebhookConfig = () => {
    setAlertConfig(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        webhook: {
          enabled: false,
          url: '',
          secret: '',
          headers: {},
        },
      },
    }));
    localStorage.setItem('zhixu-alert-config', JSON.stringify({
      ...alertConfig,
      channels: {
        ...alertConfig.channels,
        webhook: {
          enabled: false,
          url: '',
          secret: '',
          headers: {},
        },
      },
    }));
    toast.info('Webhook配置已清空');
  };

  const testConnection = async () => {
    try {
      const response = await api.get('/api/health');
      if (response.data?.success !== false) {
        toast.success('连接成功！服务状态正常');
      } else {
        toast.error('连接失败');
      }
    } catch (error) {
      toast.error('连接失败，请检查服务是否启动');
    }
  };

  const testDingtalk = async () => {
    if (!alertConfig.channels.dingtalk.webhookUrl) {
      toast.warning('请先填写钉钉 Webhook 地址');
      return;
    }
    setSendingDingtalk(true);
    try {
      const response = await api.post('/api/alerts/test', {
        channel: 'dingtalk',
        config: alertConfig.channels.dingtalk,
      });
      if (response.success) {
        toast.success('已成功发送，钉钉机器人已收到测试消息');
      } else {
        const detail = response.details;
        const msg = response.message || '钉钉测试消息发送失败';
        toast.error(`${msg}${detail ? `：${detail}` : ''}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '钉钉测试消息发送失败';
      toast.error(`发送失败：${msg}。请检查 Webhook 地址和加签密钥是否正确`);
    } finally {
      setSendingDingtalk(false);
    }
  };

  const testEmail = async () => {
    if (!alertConfig.channels.email.smtpServer || !alertConfig.channels.email.toEmails) {
      toast.warning('请先填写完整的邮箱配置');
      return;
    }
    if (!alertConfig.channels.email.username || !alertConfig.channels.email.password) {
      toast.warning('请填写 SMTP 用户名和密码（授权码）');
      return;
    }
    setSendingEmail(true);
    try {
      const response = await api.post('/api/alerts/test', {
        channel: 'email',
        config: alertConfig.channels.email,
      });
      if (response.success) {
        const serverInfo = `（${alertConfig.channels.email.smtpServer}:${alertConfig.channels.email.smtpPort}）`;
        toast.success(`已成功发送 ${serverInfo}，请查收收件人邮箱`);
      } else {
        const detail = response.details;
        const msg = response.message || '发送测试邮件失败';
        toast.error(`${msg}${detail ? `：${detail}` : ''}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '发送测试邮件失败';
      toast.error(`发送失败：${msg}。请检查 SMTP 服务器、端口、用户名和授权码是否正确`);
    } finally {
      setSendingEmail(false);
    }
  };

  const testWebhook = async () => {
    if (!alertConfig.channels.webhook.url) {
      toast.warning('请先填写 Webhook 地址');
      return;
    }
    setSendingWebhook(true);
    try {
      const response = await api.post('/api/alerts/test', {
        channel: 'webhook',
        config: alertConfig.channels.webhook,
      });
      if (response.success) {
        toast.success('已成功发送，Webhook 端点已收到测试请求');
      } else {
        const detail = response.details;
        const msg = response.message || 'Webhook 测试请求发送失败';
        toast.error(`${msg}${detail ? `：${detail}` : ''}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Webhook 测试请求失败';
      toast.error(`发送失败：${msg}。请检查 Webhook URL 是否可访问`);
    } finally {
      setSendingWebhook(false);
    }
  };

  return (
    <div className="page">
      {/* 页面头部 */}
      <div className="page-header">
        <h1 className="page-title">⚙️ 系统设置</h1>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? '保存中...' : saved ? '✅ 已保存' : '💾 保存设置'}
        </button>
      </div>

      {/* 标签页 */}
      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === 'alert' ? 'active' : ''}`}
          onClick={() => setActiveTab('alert')}
        >
          🔔 告警配置
        </button>
        <button
          className={`settings-tab ${activeTab === 'otel' ? 'active' : ''}`}
          onClick={() => setActiveTab('otel')}
        >
          📡 数据采集
        </button>
        <button
          className={`settings-tab ${activeTab === 'ui' ? 'active' : ''}`}
          onClick={() => setActiveTab('ui')}
        >
          🖥️ 界面配置
        </button>
      </div>

      {/* 告警配置 */}
      {activeTab === 'alert' && (
        <div className="settings-content">
          {/* 告警总开关 */}
          <div className="card alert-master-switch">
            <div className="alert-master-content">
              <div>
                <h3>告警通知</h3>
                <p>当系统指标超过阈值时，发送告警通知</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={alertConfig.enabled}
                  onChange={(e) => setAlertConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {/* 钉钉配置 */}
          <div className="card">
            <div className="channel-header">
              <div className="channel-title">
                <span className="channel-icon">💬</span>
                <div>
                  <h3>钉钉</h3>
                  <p>通过钉钉机器人发送告警消息</p>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={alertConfig.channels.dingtalk.enabled}
                  onChange={(e) => setAlertConfig(prev => ({
                    ...prev,
                    channels: { ...prev.channels, dingtalk: { ...prev.channels.dingtalk, enabled: e.target.checked } }
                  }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {alertConfig.channels.dingtalk.enabled && (
              <div className="channel-config">
                <div className="form-group">
                  <label>Webhook 地址</label>
                  <input
                    type="text"
                    value={alertConfig.channels.dingtalk.webhookUrl}
                    onChange={(e) => setAlertConfig(prev => ({
                      ...prev,
                      channels: { ...prev.channels, dingtalk: { ...prev.channels.dingtalk, webhookUrl: e.target.value } }
                    }))}
                    placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx"
                  />
                  <span className="form-hint">在钉钉群中添加自定义机器人，复制 Webhook 地址</span>
                </div>
                <div className="form-group">
                  <label>加签密钥（可选）</label>
                  <input
                    type="password"
                    value={alertConfig.channels.dingtalk.secret}
                    onChange={(e) => setAlertConfig(prev => ({
                      ...prev,
                      channels: { ...prev.channels, dingtalk: { ...prev.channels.dingtalk, secret: e.target.value } }
                    }))}
                    placeholder="SEC开头的密钥"
                  />
                </div>
                <div className="button-group">
                  <button className="btn btn-secondary" onClick={testDingtalk} disabled={sendingDingtalk}>
                    {sendingDingtalk ? '⏳ 发送中...' : '🧪 发送测试消息'}
                  </button>
                  <button className="btn btn-primary" onClick={saveDingtalkConfig}>
                    💾 保存配置
                  </button>
                  <button className="btn btn-danger" onClick={clearDingtalkConfig}>
                    🗑️ 清空配置
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 邮箱配置 */}
          <div className="card">
            <div className="channel-header">
              <div className="channel-title">
                <span className="channel-icon">📧</span>
                <div>
                  <h3>邮件</h3>
                  <p>通过 SMTP 发送告警邮件</p>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={alertConfig.channels.email.enabled}
                  onChange={(e) => setAlertConfig(prev => ({
                    ...prev,
                    channels: { ...prev.channels, email: { ...prev.channels.email, enabled: e.target.checked } }
                  }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {alertConfig.channels.email.enabled && (
              <div className="channel-config">
                <div className="form-row">
                  <div className="form-group">
                    <label>SMTP 服务器</label>
                    <input
                      type="text"
                      value={alertConfig.channels.email.smtpServer}
                      onChange={(e) => setAlertConfig(prev => ({
                        ...prev,
                        channels: { ...prev.channels, email: { ...prev.channels.email, smtpServer: e.target.value } }
                      }))}
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div className="form-group" style={{ maxWidth: '120px' }}>
                    <label>端口</label>
                    <input
                      type="number"
                      value={alertConfig.channels.email.smtpPort}
                      onChange={(e) => setAlertConfig(prev => ({
                        ...prev,
                        channels: { ...prev.channels, email: { ...prev.channels.email, smtpPort: parseInt(e.target.value) || 587 } }
                      }))}
                      placeholder="587"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>用户名</label>
                  <input
                    type="text"
                    value={alertConfig.channels.email.username}
                    onChange={(e) => setAlertConfig(prev => ({
                      ...prev,
                      channels: { ...prev.channels, email: { ...prev.channels.email, username: e.target.value } }
                    }))}
                    placeholder="your-email@gmail.com"
                  />
                </div>
                <div className="form-group">
                  <label>密码 / App 密码</label>
                  <input
                    type="password"
                    value={alertConfig.channels.email.password}
                    onChange={(e) => setAlertConfig(prev => ({
                      ...prev,
                      channels: { ...prev.channels, email: { ...prev.channels.email, password: e.target.value } }
                    }))}
                    placeholder="应用专用密码"
                  />
                  <span className="form-hint">建议使用应用专用密码而非登录密码</span>
                </div>
                <div className="form-group">
                  <label>收件人邮箱</label>
                  <input
                    type="text"
                    value={alertConfig.channels.email.toEmails}
                    onChange={(e) => setAlertConfig(prev => ({
                      ...prev,
                      channels: { ...prev.channels, email: { ...prev.channels.email, toEmails: e.target.value } }
                    }))}
                    placeholder="admin@example.com, oncall@example.com"
                  />
                  <span className="form-hint">多个邮箱用逗号分隔</span>
                </div>
                <div className="button-group">
                  <button className="btn btn-secondary" onClick={testEmail} disabled={sendingEmail}>
                    {sendingEmail ? '⏳ 发送中...' : '🧪 发送测试邮件'}
                  </button>
                  <button className="btn btn-primary" onClick={saveEmailConfig}>
                    💾 保存配置
                  </button>
                  <button className="btn btn-danger" onClick={clearEmailConfig}>
                    🗑️ 清空配置
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Webhook 配置 */}
          <div className="card">
            <div className="channel-header">
              <div className="channel-title">
                <span className="channel-icon">🔗</span>
                <div>
                  <h3>Webhook</h3>
                  <p>向自定义 URL 发送 HTTP POST 请求</p>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={alertConfig.channels.webhook.enabled}
                  onChange={(e) => setAlertConfig(prev => ({
                    ...prev,
                    channels: { ...prev.channels, webhook: { ...prev.channels.webhook, enabled: e.target.checked } }
                  }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {alertConfig.channels.webhook.enabled && (
              <div className="channel-config">
                <div className="form-group">
                  <label>Webhook URL</label>
                  <input
                    type="text"
                    value={alertConfig.channels.webhook.url}
                    onChange={(e) => setAlertConfig(prev => ({
                      ...prev,
                      channels: { ...prev.channels, webhook: { ...prev.channels.webhook, url: e.target.value } }
                    }))}
                    placeholder="https://your-webhook-endpoint.com/alert"
                  />
                </div>
                <div className="form-group">
                  <label>密钥（可选）</label>
                  <input
                    type="password"
                    value={alertConfig.channels.webhook.secret}
                    onChange={(e) => setAlertConfig(prev => ({
                      ...prev,
                      channels: { ...prev.channels, webhook: { ...prev.channels.webhook, secret: e.target.value } }
                    }))}
                    placeholder="用于签名验证"
                  />
                </div>
                <div className="button-group">
                  <button className="btn btn-secondary" onClick={testWebhook} disabled={sendingWebhook}>
                    {sendingWebhook ? '⏳ 发送中...' : '🧪 发送测试请求'}
                  </button>
                  <button className="btn btn-primary" onClick={saveWebhookConfig}>
                    💾 保存配置
                  </button>
                  <button className="btn btn-danger" onClick={clearWebhookConfig}>
                    🗑️ 清空配置
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 告警阈值 */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>⚠️ 告警阈值</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Token 消耗阈值</label>
                <input
                  type="number"
                  value={alertConfig.rules.tokenThreshold}
                  onChange={(e) => setAlertConfig(prev => ({
                    ...prev,
                    rules: { ...prev.rules, tokenThreshold: parseInt(e.target.value) || 0 }
                  }))}
                />
                <span className="form-hint">日 Token 消耗超过此值时告警</span>
              </div>
              <div className="form-group">
                <label>错误率阈值 (%)</label>
                <input
                  type="number"
                  value={alertConfig.rules.errorRateThreshold}
                  onChange={(e) => setAlertConfig(prev => ({
                    ...prev,
                    rules: { ...prev.rules, errorRateThreshold: parseFloat(e.target.value) || 0 }
                  }))}
                />
                <span className="form-hint">错误率超过此百分比时告警</span>
              </div>
              <div className="form-group">
                <label>延迟阈值 (ms)</label>
                <input
                  type="number"
                  value={alertConfig.rules.latencyThreshold}
                  onChange={(e) => setAlertConfig(prev => ({
                    ...prev,
                    rules: { ...prev.rules, latencyThreshold: parseInt(e.target.value) || 0 }
                  }))}
                />
                <span className="form-hint">平均延迟超过此值时告警</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OpenTelemetry 配置 */}
      {activeTab === 'otel' && (
        <div className="settings-content">
          <div className="card">
            <h3 style={{ marginBottom: '1.5rem' }}>📡 OpenTelemetry 数据采集配置</h3>

            <div className="form-group">
              <label>OTEL 端点</label>
              <input
                type="text"
                value={otelConfig.endpoint}
                onChange={(e) => setOtelConfig(prev => ({ ...prev, endpoint: e.target.value }))}
                placeholder="http://localhost:4318"
              />
              <span className="form-hint">OpenTelemetry Collector 的 gRPC 或 HTTP 端点</span>
            </div>

            <div className="form-group">
              <label>服务名称</label>
              <input
                type="text"
                value={otelConfig.serviceName}
                onChange={(e) => setOtelConfig(prev => ({ ...prev, serviceName: e.target.value }))}
                placeholder="zhixu-server"
              />
            </div>

            <button className="btn btn-secondary" onClick={testConnection}>
              🔗 测试连接
            </button>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>📝 配置说明</h3>
            <div className="config-info">
              <p><strong>OTEL 端点：</strong>数据采集器地址，用于接收来自 AI 编程工具的追踪数据</p>
              <p><strong>服务名称：</strong>在监控系统中的标识名称，便于区分不同服务</p>
            </div>
          </div>
        </div>
      )}

      {/* 界面配置 */}
      {activeTab === 'ui' && (
        <div className="settings-content">
          <div className="card">
            <h3 style={{ marginBottom: '1.5rem' }}>🖥️ 界面显示配置</h3>

            <div className="form-group">
              <label>数据刷新间隔（秒）</label>
              <input
                type="number"
                value={uiConfig.refreshInterval}
                onChange={(e) => setUiConfig(prev => ({ ...prev, refreshInterval: parseInt(e.target.value) || 30 }))}
                min={10}
                max={300}
              />
              <span className="form-hint">建议值：10-300秒，值越小刷新越频繁</span>
            </div>

            <div className="form-group">
              <label>界面主题</label>
              <select
                value={uiConfig.theme}
                onChange={(e) => setUiConfig(prev => ({ ...prev, theme: e.target.value as 'dark' | 'light' }))}
              >
                <option value="dark">深色主题（科技风）</option>
                <option value="light">浅色主题</option>
              </select>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>ℹ️ 关于</h3>
            <div className="about-info">
              <div className="about-row">
                <span>版本</span>
                <span>1.0.0</span>
              </div>
              <div className="about-row">
                <span>构建日期</span>
                <span>2026-06-15</span>
              </div>
              <div className="about-row">
                <span>许可证</span>
                <span>MIT</span>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                知墟 (ZhiXu ACOP) 是一个统一的 AI 编程助手观测与优化平台，
                支持 Trae、Claude Code、Cursor 等工具的数据采集、监控和自动优化。
              </p>
            </div>
          </div>
        </div>
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default Settings;
