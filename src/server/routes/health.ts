import { Router } from 'express';

const router = Router();

// 健康检查端点
router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    },
  });
});

// 就绪检查端点
router.get('/ready', (_req, res) => {
  // TODO: 检查数据库、Redis 等依赖是否就绪
  res.json({
    success: true,
    data: {
      ready: true,
      dependencies: {
        database: 'ok',
        redis: 'ok',
      },
    },
  });
});

export { router as healthRoutes };
