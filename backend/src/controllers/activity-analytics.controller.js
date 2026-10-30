import { activityAnalyticsService } from '../services/activity-analytics.service.js';
import { parseInput } from '../middlewares/validate.middleware.js';
import { analyticsEventSchema } from '../validators/analytics.validator.js';
import { success } from '../utils/response.js';

export const activityAnalyticsController={
  track:async(req,res)=>{await activityAnalyticsService.track(req.user.id,parseInput(analyticsEventSchema,req.body));return success(res,'Page activity recorded');},
  creator:async(req,res)=>success(res,'Your Creator analytics',await activityAnalyticsService.creator(req.user.id)),
  admin:async(req,res)=>success(res,'Platform user activity analytics',await activityAnalyticsService.admin(req.user.id))
};
