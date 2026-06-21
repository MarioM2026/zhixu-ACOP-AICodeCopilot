import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
import Rules from './pages/Rules';
import Settings from './pages/Settings';
import Alerts from './pages/Alerts';
import PromptInjections from './pages/PromptInjections';
import ModelRouting from './pages/ModelRouting';
import ContextManagement from './pages/ContextManagement';
import Installer from './pages/Installer';
import Layout from './components/Layout';
import { api } from './services/api';

/** 首次进入检测：未配置时自动跳转到安装向导 */
function InstallerGate({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await api.get<{ completed: boolean; hasConfig: boolean }>('/api/installer/setup-status');
        if (cancelled) return;
        if (res?.success && !res.data?.completed) {
          // 首次进入且未完成安装 → 跳转到安装向导（只在路径为 / 或 /dashboard 时跳转）
          if (location.pathname === '/' || location.pathname === '/dashboard') {
            navigate('/installer', { replace: true });
            return;
          }
        }
      } catch {
        // API 不可用，按"已完成"处理
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [location.pathname, navigate]);

  if (checking && location.pathname === '/') {
    return (
      <div style={{ minHeight: '100vh', background: '#0a1220', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00f5ff', fontFamily: 'Consolas, monospace' }}>
        <div>⏳ 正在检测配置状态...</div>
      </div>
    );
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <InstallerGate>
        <Routes>
          <Route path="/installer" element={<Installer />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="events" element={<Events />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="prompts" element={<PromptInjections />} />
            <Route path="rules" element={<Rules />} />
            <Route path="settings" element={<Settings />} />
            <Route path="router" element={<ModelRouting />} />
            <Route path="context" element={<ContextManagement />} />
          </Route>
        </Routes>
      </InstallerGate>
    </BrowserRouter>
  );
}

export default App;
