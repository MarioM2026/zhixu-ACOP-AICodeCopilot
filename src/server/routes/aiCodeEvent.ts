import { Router } from 'express';
import { recordAICodeEvent, getEvents, getEventById } from '../services/aiCodeEventService';
import type { AICodeEvent } from '@zhixu/shared/types';

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

export { router as aiCodeEventRoutes };
