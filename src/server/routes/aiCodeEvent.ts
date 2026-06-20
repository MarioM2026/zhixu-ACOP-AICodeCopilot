import { Router } from 'express';
import { recordAICodeEvent, getEvents, getEventById, resetEventsToSample, clearAllEvents, hasRealEvents } from '../services/aiCodeEventService';
import type { AICodeEvent } from '@zhixu/shared/types';
import { logger } from '../services/logger';

const router = Router();

// 记录 AI 代码事件
router.post('/', async (req, res, next) => {
  try {
    const event: AICodeEvent = req.body;
    const result = await recordAICodeEvent(event);
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// 获取事件列表
router.get('/', async (req, res, next) => {
  try {
    const { page = '1', pageSize = '20', tool, startTime, endTime } = req.query;

    const result = await getEvents({
      page: Number(page),
      pageSize: Number(pageSize),
      tool: tool as string | undefined,
      startTime: startTime ? Number(startTime) : undefined,
      endTime: endTime ? Number(endTime) : undefined,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

// 获取单个事件
router.get('/:id', async (req, res, next) => {
  try {
    const event = await getEventById(req.params.id);
    if (!event) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Event not found' },
      });
      return;
    }
    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

// 重置事件：清空后恢复为 15 条模拟数据
router.post('/reset', async (_req, res) => {
  try {
    const count = await resetEventsToSample();
    logger.info('Events reset to sample data', { count });
    res.json({ success: true, message: '已重置为 ' + count + ' 条模拟事件', count });
  } catch (error) {
    logger.error('Reset events failed', { error: String(error) });
    res.status(500).json({ success: false, message: String(error) });
  }
});

// 清空所有事件
router.delete('/all', async (_req, res) => {
  try {
    await clearAllEvents();
    logger.info('All events cleared');
    res.json({ success: true, message: '所有事件已清空' });
  } catch (error) {
    logger.error('Clear all events failed', { error: String(error) });
    res.status(500).json({ success: false, message: String(error) });
  }
});

// 查询当前事件是否是真实数据
router.get('/status', (_req, res) => {
  res.json({ success: true, hasRealData: hasRealEvents() });
});

export { router as aiCodeEventRoutes };
