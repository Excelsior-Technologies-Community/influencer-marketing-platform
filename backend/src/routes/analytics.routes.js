import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { protectMutation } from '../middlewares/origin.middleware.js';
import { activityAnalyticsController as controller } from '../controllers/activity-analytics.controller.js';

export function analyticsRoutes(authService){
  const router=Router();
  router.use(authenticate(authService),protectMutation);
  router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.post('/events',controller.track);
  return router;
}
