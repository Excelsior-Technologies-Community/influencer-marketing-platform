import { campaignService as service } from '../services/campaign.service.js';
import { parseInput } from '../middlewares/validate.middleware.js';
import { emptyQuery } from '../validators/brand.validator.js';
import { campaignCreateSchema,campaignUpdateSchema,campaignListQuery,campaignCatalogQuery,campaignIdSchema } from '../validators/campaign.validator.js';
import { success } from '../utils/response.js';
export const campaignController={
  list:async(req,res)=>{const result=await service.list(req.user.id,parseInput(campaignListQuery,req.query));success(res,'Your campaigns',{items:result.items},result.meta);},
  catalogs:async(req,res)=>success(res,'Campaign choices',await service.catalogs(req.user.id,parseInput(campaignCatalogQuery,req.query).campaignId)),
  get:async(req,res)=>{parseInput(emptyQuery,req.query);success(res,'Your campaign',{campaign:await service.get(req.user.id,parseInput(campaignIdSchema,req.params.id))});},
  save:async(req,res)=>{parseInput(emptyQuery,req.query);const creating=req.method==='POST',id=creating?null:parseInput(campaignIdSchema,req.params.id);const campaign=await service.save(req.user.id,id,parseInput(creating?campaignCreateSchema:campaignUpdateSchema,req.body),req.id);res.status(creating?201:200);success(res,creating?'Campaign draft created':'Campaign draft saved',{campaign});}
};
