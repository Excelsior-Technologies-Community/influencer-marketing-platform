import { creatorService } from '../services/creator.service.js';
import { creatorDashboardService } from '../services/creator-dashboard.service.js';
import { parseInput } from '../middlewares/validate.middleware.js';
import { creatorProfileSchema,creatorEmptyQuery,creatorCategoryQuery } from '../validators/creator.validator.js';
import { success } from '../utils/response.js';
export const creatorController={
  dashboard:async(req,res)=>{parseInput(creatorEmptyQuery,req.query);success(res,'Your creator dashboard',await creatorDashboardService.get(req.user.id));},
  profile:async(req,res)=>{parseInput(creatorEmptyQuery,req.query);success(res,'Your creator profile',{profile:await creatorService.profile(req.user.id)});},
  update:async(req,res)=>{parseInput(creatorEmptyQuery,req.query);success(res,'Creator profile saved',{profile:await creatorService.update(req.user.id,parseInput(creatorProfileSchema,req.body),req.id)});},
  categories:async(req,res)=>{const result=await creatorService.categories(req.user.id,parseInput(creatorCategoryQuery,req.query));success(res,'Profile category choices',{items:result.items},result.meta);}
};
