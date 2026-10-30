import { campaignAnalyticsService } from '../services/campaign-analytics.service.js';
import { parseInput } from '../middlewares/validate.middleware.js';
import { campaignAnalyticsQuery } from '../validators/campaign-analytics.validator.js';
import { success } from '../utils/response.js';

export const campaignAnalyticsController={
  list:async(req,res)=>{
    const query=parseInput(campaignAnalyticsQuery,req.query);
    const result=await campaignAnalyticsService.list(req.user.id,query);
    return success(res,'Campaign analytics',{items:result.items},result.meta);
  }
};
