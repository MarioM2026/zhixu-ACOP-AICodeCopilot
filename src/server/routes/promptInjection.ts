import { Router } from 'express';
import {
  getPromptInjections,
  getPromptInjectionById,
  updatePromptStatus,
  deletePrompt,
  clearAllPrompts,
  getPromptStats,
  type PromptStatus,
  type PromptType,
} from '../services/promptInjectionService';

const router = Router();

// GET: 所有提示（支持 status/type/limit 过滤）
router.get('/', async (req, res, next) => {
  try {
    const { status, type, limit } = req.query;
    const list = await getPromptInjections({
      status: status as PromptStatus | undefined,
      type: type as PromptType | undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
});

// GET: 提示统计
router.get('/stats', async (_req, res, next) => {
  try {
    const stats = await getPromptStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// GET: 单条提示
router.get('/:id', async (req, res, next) => {
  try {
    const injection = await getPromptInjectionById(req.params.id);
    if (!injection) {
      res.status(404).json({ success: false, message: 'Prompt not found' });
      return;
    }
    res.json({ success: true, data: injection });
  } catch (error) {
    next(error);
  }
});

// PATCH: 更新状态
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ success: false, message: 'Missing status' });
      return;
    }
    const injection = await updatePromptStatus(req.params.id, status as PromptStatus);
    if (!injection) {
      res.status(404).json({ success: false, message: 'Prompt not found' });
      return;
    }
    res.json({ success: true, data: injection });
  } catch (error) {
    next(error);
  }
});

// DELETE: 单条
router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await deletePrompt(req.params.id);
    res.json({ success: ok, deleted: ok });
  } catch (error) {
    next(error);
  }
});

// DELETE: 清空所有
router.delete('/', async (_req, res, next) => {
  try {
    const count = await clearAllPrompts();
    res.json({ success: true, cleared: count });
  } catch (error) {
    next(error);
  }
});

export { router as promptInjectionRoutes };
