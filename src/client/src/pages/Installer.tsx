import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useToast, createToastApi, ToastContainer } from '../hooks/useToast';

// ========= 类型定义
interface EnvInfo {
  name: string;
  installed: boolean;
  version?: string;
  required: boolean;
  minimumVersion?: string;
  path?: string;
  downloadUrl?: string;
}
interface EnvSummary {
  node: EnvInfo;
  npm: EnvInfo;
  git: EnvInfo;
  os: { platform: string; release: string; totalMemoryMB: number; nodeBinDir?: string };
  allRequiredInstalled: boolean;
}
interface AiSoftwareInfo {
  type: string;
  name: string;
  detected: boolean;
  logPath?: string;
  candidatePaths: string[];
  enabled: boolean;
  manualPath?: string;
}
interface InstallStatus {
  phase: string;
  message: string;
  progress: number;
  logs: string[];
  startedAt?: number;
  completedAt?: number;
}
interface InstallConfig {
  port: number;
  frontendPort: number;
  aiSoftwares: Array<{ type: string; path: string; enabled: boolean; mode: string }>;
  theme: 'dark' | 'light';
  telemetryEnabled: boolean;
}

// ========= 4步定义
const STEPS = [
  { id: 1, key: 'env', label: '环境检测', desc: '检测 Node.js / npm / Git' },
  { id: 2, key: 'software', label: '软件选择', desc: '选择要接入的 AI 编程软件' },
  { id: 3, key: 'install', label: '安装部署', desc: '写入配置并启动服务' },
  { id: 4, key: 'complete', label: '完成配置', desc: '安装完成，开始使用' },
];

export default function Installer() {
  const navigate = useNavigate();
  const { toasts, showToast, removeToast } = useToast();
  const toast = createToastApi(showToast);

  const [currentStep, setCurrentStep] = useState(1);
  const [env, setEnv] = useState<EnvSummary | null>(null);
  const [aiSoftware, setAiSoftware] = useState<Record<string, AiSoftwareInfo>>({});
  const [aiValidating, setAiValidating] = useState<string | null>(null);
  const [aiValidation, setAiValidation] = useState<Record<string, { success: boolean; message: string; logFiles?: number; path?: string }>>({});
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [completed, setCompleted] = useState<{
    serverUrl: string;
    frontendUrl: string;
    configPath: string;
    aiSoftwares: Array<{ type: string; name: string; path: string; enabled: boolean }>;
  } | null>(null);

  // ==== 初始：从后端读取已保存配置（用于回填 + 整体状态显示）
  const [savedConfig, setSavedConfig] = useState<InstallConfig | null>(null);

  const loadSavedConfig = useCallback(async () => {
    try {
      const res = await api.get<{ completed: boolean; hasConfig: boolean; savedAt?: number; config?: InstallConfig }>('/api/installer/setup-status');
      if (res?.success && res.data?.config) {
        setSavedConfig(res.data.config);
      }
    } catch {
      // 忽略
    }
  }, []);

  useEffect(() => {
    loadSavedConfig();
  }, []);

  // ==== 步骤 1: 环境检测
  const checkEnv = useCallback(async () => {
    try {
      const res = await api.get<EnvSummary>('/api/installer/env');
      if (res?.success && res.data) {
        setEnv(res.data);
      }
    } catch (err) {
      toast.error('环境检测失败');
    }
  }, []);

  useEffect(() => {
    checkEnv();
  }, []);

  // ==== 步骤 2: AI 软件检测
  const checkAiSoftware = useCallback(async () => {
    try {
      const res = await api.get<Record<string, AiSoftwareInfo>>('/api/installer/ai-software');
      if (res?.success && res.data) {
        // ==== 回填：如果已有已保存配置，则自动设置 enabled + 合并手动路径
        const detected = { ...res.data };
        if (savedConfig?.aiSoftwares && savedConfig.aiSoftwares.length > 0) {
          savedConfig.aiSoftwares.forEach(saved => {
            if (detected[saved.type]) {
              detected[saved.type] = {
                ...detected[saved.type],
                enabled: saved.enabled,
                logPath: saved.path || detected[saved.type].logPath,
                manualPath: saved.path || detected[saved.type].manualPath,
                detected: detected[saved.type].detected || !!saved.path,
              };
            } else {
              // 已保存配置中有但默认检测没找到 → 也作为手动配置项显示
              const toolName = { trae: 'Trae', claude_code: 'Claude Code', cursor: 'Cursor', github_copilot: 'GitHub Copilot', codegeex: 'CodeGeeX' }[saved.type as string] || saved.type;
              detected[saved.type] = {
                type: saved.type,
                name: toolName,
                detected: !!saved.path,
                logPath: saved.path || '',
                candidatePaths: [],
                enabled: saved.enabled,
                manualPath: saved.path || '',
              };
            }
          });
        }
        setAiSoftware(detected);
      }
    } catch (err) {
      toast.error('AI 软件检测失败');
    }
  }, [savedConfig]);

  useEffect(() => {
    if (currentStep === 2 && Object.keys(aiSoftware).length === 0) {
      checkAiSoftware();
    }
  }, [currentStep]);

  // 切换软件启用状态
  const toggleAiSoftware = (type: string) => {
    setAiSoftware(prev => {
      const target = prev[type];
      if (!target) return prev;
      return { ...prev, [type]: { ...target, enabled: !target.enabled } as any };
    });
  };

  // 输入手动路径
  const setManualPath = (type: string, path: string) => {
    setAiSoftware(prev => {
      const target = prev[type];
      if (!target) return prev;
      return { ...prev, [type]: { ...target, manualPath: path, detected: true, logPath: path } as any };
    });
  };

  // 验证路径
  const validatePath = async (type: string, path: string) => {
    setAiValidating(type);
    try {
      const res = await api.post<{ success: boolean; exists: boolean; logFiles?: number; message: string; path: string }>('/api/installer/ai-software/validate', { software: type, path });
      if (res?.success && res.data) {
        setAiValidation(prev => ({ ...prev, [type]: res.data! }));
        if (res.data.success) {
          toast.success(res.data.message);
        } else {
          toast.warning(res.data.message);
        }
      }
    } catch {
      toast.error('路径验证失败');
    } finally {
      setAiValidating(null);
    }
  };

  // ==== 步骤 3: 安装流程
  const runInstall = async () => {
    setInstalling(true);
    const config: InstallConfig = {
      port: 3001,
      frontendPort: 5173,
      aiSoftwares: Object.values(aiSoftware).map(s => ({
        type: s.type,
        path: s.logPath || '',
        enabled: s.enabled,
        mode: 'auto',
      })).filter(s => s.enabled),
      theme: 'dark',
      telemetryEnabled: false,
    };
    try {
      const res = await api.post<InstallStatus>('/api/installer/install', config);
      if (res?.success && res.data) {
        setInstallStatus(res.data);
      }
      // 轮询等待进入 completed 状态
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 400));
        const statusRes = await api.get<InstallStatus>('/api/installer/status');
        if (statusRes?.success && statusRes.data) {
          setInstallStatus(statusRes.data);
          if (['completed', 'failed', 'running'].includes(statusRes.data.phase)) break;
        }
      }
      // 进入下一步
      setTimeout(() => setCurrentStep(4), 800);
    } catch (err) {
      toast.error('安装失败');
    } finally {
      setInstalling(false);
    }

    // 获取完成后系统信息
    try {
      const complete = await api.get<any>('/api/installer/complete');
      if (complete?.success && complete.data) {
        setCompleted(complete.data);
      }
    } catch {}
  };

  // 跳转到下一步
  const goNext = () => {
    if (currentStep === 3) {
      runInstall();
    } else if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };
  const goPrev = () => currentStep > 1 && setCurrentStep(currentStep - 1);

  return (
    <div className="installer-page">
      {/* 顶部标题 */}
      <div className="installer-header">
        <div className="installer-logo">◈</div>
        <div>
          <h1 className="installer-title">知墟 ACOP · 安装向导</h1>
          <p className="installer-subtitle">AI 编程助手观测与优化平台</p>
        </div>
        <div className="installer-step-indicator-inline">
          步骤 {currentStep} / {STEPS.length}
        </div>
      </div>

      {/* 步骤指示器 */}
      <div className="installer-steps">
        {STEPS.map(step => (
          <div
            key={step.id}
            className={`installer-step ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
          >
            <div className="installer-step-circle">{currentStep > step.id ? '✓' : step.id}</div>
            <div className="installer-step-text">
              <div className="installer-step-label">{step.label}</div>
              <div className="installer-step-desc">{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 内容区 */}
      <div className="installer-content">
        {/* 步骤 1：环境检测 */}
        {currentStep === 1 && (
          <div className="installer-card">
          <h2 className="installer-card-title">🔍 环境检测</h2>
          <p className="installer-card-sub">正在检查您的系统环境，确保所有必需的依赖都已就绪。</p>
          {!env ? (
            <div className="installer-loading">⏳ 检测中...</div>
          ) : (
            <>
              <div className="installer-env-list">
                {[
                  { key: 'node', icon: '⬢', info: env.node },
                  { key: 'npm', icon: '📦', info: env.npm },
                  { key: 'git', icon: '🔀', info: env.git },
                ].map(({ key, icon, info }) => (
                  <div key={key} className={`installer-env-item ${info.installed ? 'ok' : 'missing'}`}>
                    <div className="installer-env-icon">{icon}</div>
                    <div className="installer-env-info">
                      <div className="installer-env-name">
                        {info.name}
                        {info.required ? <span className="installer-env-tag">必需</span> : <span className="installer-env-tag-opt">可选</span>}
                      </div>
                      <div className="installer-env-version">
                        {info.installed ? `版本 ${info.version || '已安装'}` : '未检测到'}
                        {info.minimumVersion ? `（最低 ${info.minimumVersion}` : ''}
                      </div>
                    </div>
                    <div className={`installer-env-status ${info.installed ? 'ok' : 'missing'}`}>
                      {info.installed ? '✓ 已就绪' : '✗ 未安装'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="installer-env-os">
                <span>操作系统：</span>
                <span>{env.os.platform} {env.os.release}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}>
                  内存约 {Math.round(env.os.totalMemoryMB / 1024)} GB
                </span>
              </div>
            </>
          )}
        </div>
        )}

        {/* 步骤 2：软件选择 */}
        {currentStep === 2 && (
          <div className="installer-card">
            <h2 className="installer-card-title">🤖 选择 AI 编程软件</h2>
            <p className="installer-card-sub">选择您日常使用的 AI 编程工具，我们将为其配置日志采集与分析。</p>
            {Object.keys(aiSoftware).length === 0 ? (
              <div className="installer-loading">⏳ 扫描中...</div>
            ) : (
              <div className="installer-ai-grid">
                {Object.entries(aiSoftware).map(([type, info]) => (
                  <div
                    key={type}
                    className={`installer-ai-card ${info.enabled ? 'selected' : ''} ${info.detected ? 'detected' : ''}`}
                    onClick={() => toggleAiSoftware(type)}
                  >
                    <div className="installer-ai-icon">
                      {type === 'trae' ? '🚀' : type === 'claude_code' ? '🤖' : type === 'cursor' ? '⚡' : '✨'}
                    </div>
                    <div className="installer-ai-name">{info.name}</div>
                    <div className={`installer-ai-status ${info.detected ? 'ok' : 'missing'}`}>
                      {info.detected ? '✓ 已检测到' : '⚠ 未检测到'}
                    </div>
                    {info.logPath && (
                      <div className="installer-ai-path">日志：{info.logPath.length > 40 ? info.logPath.slice(0, 40) + '...' : info.logPath}</div>
                    )}
                    {!info.detected && (
                      <div className="installer-ai-manual">
                        <input
                          type="text"
                          placeholder="手动输入日志目录..."
                          value={info.manualPath || ''}
                          onChange={(e) => setManualPath(type, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: '100%', marginTop: '0.75rem' }}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={(e) => { e.stopPropagation(); if (info.manualPath) validatePath(type, info.manualPath); }}
                          disabled={aiValidating === type}
                          style={{ width: '100%', marginTop: '0.5rem' }}
                        >
                          {aiValidating === type ? '验证中...' : '验证路径'}
                        </button>
                        {aiValidation[type] && (
                          <div
                            className={`installer-ai-valid-msg ${aiValidation[type].success ? 'ok' : 'missing'}`}
                            style={{ marginTop: '0.5rem' }}
                          >
                            {aiValidation[type].message}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="installer-ai-toggle" style={{ marginTop: '0.75rem' }}>
                      <label style={{ fontSize: '0.8rem', color: info.enabled ? 'var(--primary-color)' : 'var(--text-secondary)' }}>
                        {info.enabled ? '已选择接入' : '点击选择接入'}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="installer-hint" style={{ marginTop: '1rem' }}>
              💡 提示：您可以稍后在设置页添加更多软件。未选择任何软件也可以完成安装。
            </div>
          </div>
        )}

        {/* 步骤 3：安装部署 */}
        {currentStep === 3 && (
          <div className="installer-card">
            <h2 className="installer-card-title">⚙️ 安装部署</h2>
            <p className="installer-card-sub">正在写入配置并启动知墟 ACOP 服务。</p>
            <div className="installer-progress">
              <div
                className="installer-progress-bar"
                style={{ width: `${installStatus ? installStatus.progress : 0}%` }}
              >
                <span className="installer-progress-label">{installStatus ? `${installStatus.progress}%` : '0%'}</span>
              </div>
              <div className="installer-progress-text">
                {installing ? '正在写入配置...' : (installStatus?.message || '准备就绪')}
              </div>
            </div>
            <div className="installer-log-panel">
              <div className="installer-log-title">📜 日志输出</div>
              <div className="installer-log-body">
                {installStatus?.logs?.map((line, i) => (
                  <div key={i} className="installer-log-line">{line}</div>
                ))}
                {!installStatus?.logs?.length && (
                  <div className="installer-log-line installer-log-empty">等待日志输出...</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 步骤 4：完成 */}
        {currentStep === 4 && (
          <div className="installer-card">
            <div className="installer-complete">
              <div className="installer-complete-icon">🎉</div>
              <h2 className="installer-card-title">安装完成！</h2>
              <p className="installer-card-sub">知墟 ACOP 已成功部署，现在可以开始使用啦！</p>

              {completed && (
                <div className="installer-complete-info">
                  <div className="installer-complete-line">
                    <span className="installer-complete-label">后端服务地址：</span>
                    <span className="installer-complete-value">{completed.serverUrl}</span>
                  </div>
                  <div className="installer-complete-line">
                    <span className="installer-complete-label">前端服务地址：</span>
                    <span className="installer-complete-value">{completed.frontendUrl}</span>
                  </div>
                  <div className="installer-complete-line">
                    <span className="installer-complete-label">配置文件路径：</span>
                    <span className="installer-complete-value">{completed.configPath}</span>
                  </div>
                  {completed.aiSoftwares.length > 0 && (
                    <>
                      <div style={{ marginTop: '0.5rem' }}>
                        <span className="installer-complete-label">已配置的 AI 软件：</span>
                      </div>
                      {completed.aiSoftwares.map((s, i) => (
                        <div key={i} style={{ padding: '0.3rem', paddingLeft: '1rem', fontSize: '0.8rem' }}>
                          · {s.name} — {s.path || '(未指定路径)'}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="installer-actions">
        {currentStep > 1 && currentStep < 4 && (
          <button className="btn btn-secondary" onClick={goPrev} disabled={installing}>← 上一步</button>
        )}
        {currentStep === 1 && (
          <button
            className="btn btn-primary"
            onClick={goNext}
            disabled={!env?.allRequiredInstalled}
            style={{ marginLeft: 'auto' }}
          >
            下一步：软件选择 →
          </button>
        )}
        {currentStep === 2 && (
          <button className="btn btn-primary" onClick={goNext} style={{ marginLeft: 'auto' }}>
            下一步：安装部署 →
          </button>
        )}
        {currentStep === 3 && (
          <button
            className="btn btn-primary"
            onClick={runInstall}
            disabled={installing}
            style={{ marginLeft: 'auto' }}
          >
            {installing ? '安装中...' : '▶ 开始安装'}
          </button>
        )}
        {currentStep === 4 && (
          <>
            <button className="btn btn-secondary" onClick={() => navigate('/settings')} style={{ marginLeft: 'auto' }}>
              前往设置
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
              📊 进入仪表盘
            </button>
          </>
        )}
      </div>

      {/* Toast */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* 样式块 */}
      <style>{`
        .installer-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #0a0f1a 0%, #0a1220 50%, #0a0f1a 100%);
          padding: 2rem 3rem;
          font-family: 'JetBrains Mono', 'Consolas', monospace;
          color: var(--text-primary);
        }
        .installer-header {
          max-width: 1100px;
          margin: 0 auto 2rem;
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .installer-logo {
          width: 56px;
          height: 56px;
          background: linear-gradient(135deg, var(--primary-color), #0088aa);
          border-radius: 14px;
          font-size: 1.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 30px var(--glow-primary);
          color: var(--bg-primary);
        }
        .installer-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .installer-subtitle {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }
        .installer-step-indicator-inline {
          margin-left: auto;
          padding: 0.4rem 1rem;
          background: rgba(0,245,255,0.08);
          color: var(--primary-color);
          border: 1px solid var(--border-color);
          border-radius: 999px;
          font-size: 0.85rem;
        }

        /* 步骤 */
        .installer-steps {
          max-width: 1100px;
          margin: 0 auto 2rem;
          display: flex;
          gap: 0;
          background: rgba(0,245,255,0.05);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
        }
        .installer-step {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--text-secondary);
          position: relative;
        }
        .installer-step-circle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid var(--border-color);
          background: rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text-secondary);
        }
        .installer-step.active .installer-step-circle {
          background: linear-gradient(135deg, var(--primary-color), #0088aa);
          border-color: var(--primary-color);
          color: var(--bg-primary);
          box-shadow: 0 0 20px var(--glow-primary);
        }
        .installer-step.completed .installer-step-circle {
          background: var(--success-color);
          border-color: var(--success-color);
          color: var(--bg-primary);
        }
        .installer-step-label {
          font-size: 0.9rem;
          color: var(--text-primary);
          font-weight: 500;
        }
        .installer-step-desc {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.15rem;
        }
        .installer-step.active {
          color: var(--primary-color);
        }

        /* 卡片 */
        .installer-content {
          max-width: 1100px;
          margin: 0 auto;
        }
        .installer-card {
          background: rgba(15, 25, 35, 0.9);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 2.5rem;
          backdrop-filter: blur(10px);
        }
        .installer-card-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.5rem;
        }
        .installer-card-sub {
          font-size: 0.9rem;
          color: var(--text-secondary);
          margin-bottom: 2rem;
          line-height: 1.6;
        }
        .installer-loading {
          padding: 3rem;
          text-align: center;
          color: var(--text-secondary);
          font-size: 1rem;
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        /* 环境项 */
        .installer-env-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }
        .installer-env-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem;
          background: rgba(0,0,0,0.4);
          border-radius: 10px;
          border: 1px solid var(--border-color);
        }
        .installer-env-item.ok {
          border-left: 3px solid var(--success-color);
        }
        .installer-env-item.missing {
          border-left: 3px solid var(--error-color);
        }
        .installer-env-icon {
          width: 48px;
          height: 48px;
          background: rgba(0,245,255,0.08);
          border-radius: 10px;
          font-size: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .installer-env-info {
          flex: 1;
        }
        .installer-env-name {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 0.3rem;
        }
        .installer-env-tag {
          margin-left: 0.5rem;
          padding: 0.15rem 0.5rem;
          background: rgba(0,245,255,0.15);
          color: var(--primary-color);
          border-radius: 4px;
          font-size: 0.7rem;
        }
        .installer-env-tag-opt {
          margin-left: 0.5rem;
          padding: 0.15rem 0.5rem;
          background: rgba(255,255,255,0.08);
          color: var(--text-secondary);
          border-radius: 4px;
          font-size: 0.7rem;
        }
        .installer-env-version {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .installer-env-status {
          padding: 0.3rem 1rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .installer-env-status.ok {
          background: rgba(0,255,136,0.15);
          color: var(--success-color);
        }
        .installer-env-status.missing {
          background: rgba(255,51,102,0.15);
          color: var(--error-color);
        }
        .installer-env-os {
          margin-top: 1.5rem;
          padding: 1rem 1.25rem;
          background: rgba(0,0,0,0.3);
          border-radius: 8px;
          display: flex;
          gap: 0.75rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
          align-items: center;
        }

        /* AI 软件卡片 */
        .installer-ai-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1rem;
          margin-top: 1.5rem;
        }
        .installer-ai-card {
          padding: 1.5rem 1.25rem;
          background: rgba(0,0,0,0.3);
          border: 2px solid var(--border-color);
          border-radius: 14px;
          text-align: center;
          cursor: pointer;
          transition: all 0.25s;
        }
        .installer-ai-card:hover {
          border-color: var(--primary-color);
          background: rgba(0,245,255,0.08);
        }
        .installer-ai-card.selected {
          border-color: var(--primary-color);
          background: rgba(0,245,255,0.12);
          box-shadow: 0 0 25px rgba(0,245,255,0.2);
        }
        .installer-ai-card.detected {
          border-color: var(--success-color);
        }
        .installer-ai-icon {
          font-size: 2.25rem;
          margin-bottom: 0.75rem;
        }
        .installer-ai-name {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 0.35rem;
        }
        .installer-ai-status {
          font-size: 0.8rem;
          margin-bottom: 0.5rem;
        }
        .installer-ai-status.ok {
          color: var(--success-color);
        }
        .installer-ai-status.missing {
          color: var(--warning-color);
        }
        .installer-ai-path {
          font-size: 0.75rem;
          color: var(--text-secondary);
          padding: 0.35rem;
          word-break: break-all;
        }
        .installer-ai-valid-msg {
          font-size: 0.75rem;
          padding: 0.35rem 0.5rem;
          border-radius: 4px;
        }
        .installer-ai-valid-msg.ok {
          color: var(--success-color);
          background: rgba(0,255,136,0.08);
        }
        .installer-ai-valid-msg.missing {
          color: var(--error-color);
          background: rgba(255,51,102,0.08);
        }
        .installer-hint {
          padding: 1rem;
          background: rgba(0,0,0,0.3);
          border-radius: 8px;
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        /* 进度条 */
        .installer-progress {
          margin-top: 2rem;
        }
        .installer-progress-bar {
          height: 12px;
          background: linear-gradient(90deg, var(--primary-color) 0%, #0088aa 100%);
          border-radius: 6px;
          position: relative;
          transition: width 0.3s ease-out;
          box-shadow: 0 0 20px var(--glow-primary);
        }
        .installer-progress-text {
          margin-top: 1rem;
          font-size: 0.9rem;
          color: var(--text-primary);
          text-align: center;
        }
        .installer-progress-label {
          position: absolute;
          right: 0.5rem;
          top: -1.5rem;
          font-size: 0.8rem;
          color: var(--primary-color);
          font-weight: 600;
        }

        /* 日志面板 */
        .installer-log-panel {
          margin-top: 2rem;
          background: rgba(0,0,0,0.5);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 1rem;
          height: 220px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .installer-log-title {
          font-size: 0.85rem;
          color: var(--text-secondary);
          padding-bottom: 0.75rem;
          border-bottom: 1px solid var(--border-color);
          margin-bottom: 0.75rem;
        }
        .installer-log-body {
          flex: 1;
          overflow-y: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          line-height: 1.8;
        }
        .installer-log-line {
          color: var(--text-secondary);
        }
        .installer-log-empty {
          color: var(--text-muted);
          text-align: center;
          padding: 2rem;
        }

        /* 完成页 */
        .installer-complete {
          text-align: center;
          padding: 2rem 0;
        }
        .installer-complete-icon {
          font-size: 4.5rem;
          margin-bottom: 1.5rem;
          animation: bounce 1.2s ease;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .installer-complete-info {
          margin-top: 2rem;
          padding: 1.5rem;
          background: rgba(0,0,0,0.3);
          border-radius: 12px;
          text-align: left;
          max-width: 500px;
          margin-left: auto;
          margin-right: auto;
        }
        .installer-complete-line {
          display: flex;
          align-items: center;
          padding: 0.5rem 0;
          font-size: 0.9rem;
        }
        .installer-complete-label {
          color: var(--text-secondary);
          width: 120px;
          flex-shrink: 0;
        }
        .installer-complete-value {
          color: var(--primary-color);
          font-family: 'JetBrains Mono', monospace;
          flex: 1;
          word-break: break-all;
        }

        /* 底部按钮 */
        .installer-actions {
          max-width: 1100px;
          margin: 2rem auto 0;
          display: flex;
          gap: 1rem;
          padding-bottom: 2rem;
        }
        .installer-actions .btn {
          padding: 0.85rem 2rem;
        }
      `}</style>
    </div>
  );
}
