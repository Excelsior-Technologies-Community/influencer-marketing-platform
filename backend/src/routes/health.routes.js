import { Router } from 'express';
import { healthControllers } from '../controllers/health.controller.js';
export function healthRoutes(checkDatabase) {
  const router = Router();
  const controller = healthControllers(checkDatabase);
  router.get('/health', controller.live);
  router.get('/health/ready', controller.ready);
  return router;
}
