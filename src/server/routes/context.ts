import { Router } from 'express';
import {
  contextManagerService,
  analyzeSessions,
  getSession,
  getSessionEvents,
  getStats,
  recordAction,
  getHistory,
  getConfig,
  updateConfig,
} from '../services/contextManagerService';
import { logger } from '../services/logger';

const router = Router();

// GET /api/context/sessions — 所有会话画像
router.get('/sessions', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const minScore = Number(req.query.minScore);
    const riskFilter = req.query.risk as string;
    let sessions = await analyzeSessions(force);

    if (!Number.isNaN(minScore)) {
      sessions = sessions.filter(s => s.importanceScore >= minScore);
    }
    if (riskFilter && riskFilter !== 'all') {
      sessions = sessions.filter(s => s.riskLevel === riskFilter);
    }

    const page = Number(req.query.page) || 1;
    const pageSize = Math.min(200, Number(req.query.pageSize) || 50);
    const start = (page - 1) * pageSize;
    const paged = sessions.slice(start, start + pageSize);

    return res.json({
      success: true,
      data: paged,
      pagination: { page, pageSize, total: sessions.length },
    });
  } catch (err) {
    logger.error('[Context] /sessions 错误', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /api/context/sessions/:sessionId — 单个会话画像
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: '会话不存在' });
    }
    return res.json({ success: true, data: session });
  } catch (err) {
    logger.error('[Context] /sessions/:id 错误', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /api/context/sessions/:sessionId/events — 获取会话的事件列表
router.get('/sessions/:sessionId/events', async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const events = await getSessionEvents(req.params.sessionId, limit);
    return res.json({ success: true, data: events, count: events.length });
  } catch (err) {
    logger.error('[Context] /sessions/:id/events 错误', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /api/context/stats — 上下文整体统计
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats();
    return res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('[Context] /stats 错误', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/context/sessions/:sessionId/action — 记录清理/归档操作
router.post('/sessions/:sessionId/action', async (req, res) => {
  try {
    const { action, reason } = req.body || {};
    if (!action || !['keep', 'archive', 'cleanup', 'new_session'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action 参数无效' });
    }
    const entry = await recordAction(req.params.sessionId, action as any, reason || '手动操作');
    return res.json({ success: true, data: entry });
  } catch (err) {
    logger.error('[Context] /action 错误', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /api/context/history — 操作历史
router.get('/history', (req, res) => {
  try {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    return res.json({ success: true, data: getHistory(limit) });
  } catch (err) {
    logger.error('[Context] /history 错误', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /api/context/config — 获取配置
router.get('/config', (req, res) => {
  try {
    return res.json({ success: true, data: getConfig() });
  } catch (err) {
    logger.error('[Context] /config GET 错误', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// PUT /api/context/config — 更新配置
router.put('/config', async (req, res) => {
  try {
    const updated = await updateConfig(req.body || {});
    return res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('[Context] /config PUT 错误', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
