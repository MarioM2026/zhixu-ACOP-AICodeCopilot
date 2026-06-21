import { Router } from 'express';
import { checkEnv } from '../services/envService';
import { detectAllAiSoftware, validateAiSoftwarePath } from '../services/aiSoftwareService';
import {
  runInstallFlow,
  getInstallStatus,
  saveInstallConfig,
  getInstallCompleteInfo,
  getSetupStatus,
} from '../services/installService';
import type { InstallConfig, ToolType } from '../../shared/types';

const router = Router();

/** GET /api/installer/env - 环境检测 */
router.get('/env', (_req, res) => {
  try {
    const summary = checkEnv();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** GET /api/installer/ai-software - 检测已安装的 AI 软件 */
router.get('/ai-software', (_req, res) => {
  try {
    const result = detectAllAiSoftware();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** POST /api/installer/ai-software/validate - 验证用户手动输入的路径 */
router.post('/ai-software/validate', (req, res) => {
  try {
    const { software, path } = req.body as { software: ToolType; path: string };
    if (!software) {
      return res.status(400).json({ success: false, error: '缺少 software 参数' });
    }
    const result = validateAiSoftwarePath(software, path);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** POST /api/installer/config - 保存安装配置 */
router.post('/config', (req, res) => {
  try {
    const config = req.body as InstallConfig;
    const validated: InstallConfig = {
      port: Number(config.port) || 3001,
      frontendPort: Number(config.frontendPort) || 5173,
      aiSoftwares: (config.aiSoftwares || []).map(s => ({
        type: s.type,
        path: s.path || '',
        enabled: !!s.enabled,
        mode: s.mode === 'manual' ? 'manual' : 'auto',
      })),
      theme: config.theme === 'light' ? 'light' : 'dark',
      telemetryEnabled: !!config.telemetryEnabled,
    };
    const result = saveInstallConfig(validated);
    res.json({ success: result.success, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** GET /api/installer/config - 读取已保存的配置 */
router.get('/config', (_req, res) => {
  try {
    const config = loadInstallConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** POST /api/installer/install - 启动安装流程 */
router.post('/install', async (req, res) => {
  try {
    const config = (req.body as InstallConfig | undefined) || loadInstallConfig() || {
      port: 3001,
      frontendPort: 5173,
      aiSoftwares: [],
      theme: 'dark',
      telemetryEnabled: false,
    };
    const status = await runInstallFlow(config);
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** GET /api/installer/status - 获取安装状态（轮询用） */
router.get('/status', (_req, res) => {
  try {
    const status = getInstallStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** GET /api/installer/complete - 获取完成后的系统信息 */
router.get('/complete', (_req, res) => {
  try {
    const status = getSetupStatus();
    const config = status.config || {
      port: 3001,
      frontendPort: 5173,
      aiSoftwares: [],
      theme: 'dark',
      telemetryEnabled: false,
    };
    const info = getInstallCompleteInfo(config);
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** GET /api/installer/setup-status - 获取安装向导整体状态（用于前端首次进入检测） */
router.get('/setup-status', (_req, res) => {
  try {
    const status = getSetupStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** POST /api/installer/reset - 重置安装状态（调试/测试用） */
router.post('/reset', (_req, res) => {
  try {
    const status = resetInstallStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
