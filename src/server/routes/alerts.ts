import express from 'express';
import { sendTestAlert } from '../services/alertService';
import { logger } from '../services/logger';

const router = express.Router();

router.post('/test', async (req, res, next) => {
  try {
    const { channel, config } = req.body;
    
    logger.info('Received alert test request', { channel, config: { 
      ...config, 
      password: config?.password ? '***' : undefined,
      secret: config?.secret ? '***' : undefined 
    } });

    if (!channel) {
      logger.warn('Alert test failed: missing channel');
      res.status(400).json({ success: false, message: '缺少渠道参数' });
      return;
    }

    const result = await sendTestAlert(channel, config);

    logger.info('Alert test result', { channel, success: result.success, message: result.message });
    
    res.json({
      success: result.success,
      message: result.message,
      details: result.details,
    });
  } catch (error) {
    logger.error('Alert test error', { error: String(error) });
    next(error);
  }
});

export { router as alertRoutes };
