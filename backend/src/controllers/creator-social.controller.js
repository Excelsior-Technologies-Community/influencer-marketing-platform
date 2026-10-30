import { creatorSocialService as service } from '../services/creator-social.service.js';
import { socialCreateSchema,socialUpdateSchema,socialDeleteSchema,socialIdSchema } from '../validators/creator-social.validator.js';
import { creatorEmptyQuery } from '../validators/creator.validator.js';
import { parseInput } from '../middlewares/validate.middleware.js';
import { success } from '../utils/response.js';
export const creatorSocialController={
  list:async(req,res)=>{parseInput(creatorEmptyQuery,req.query);success(res,'Your social accounts',await service.list(req.user.id));},
  create:async(req,res)=>{parseInput(creatorEmptyQuery,req.query);const result=await service.save(req.user.id,null,parseInput(socialCreateSchema,req.body),req.id);res.status(201);success(res,'Social account added',result);},
  update:async(req,res)=>{parseInput(creatorEmptyQuery,req.query);success(res,'Social account saved',await service.save(req.user.id,parseInput(socialIdSchema,req.params.id),parseInput(socialUpdateSchema,req.body),req.id));},
  remove:async(req,res)=>{parseInput(creatorEmptyQuery,req.query);const {revision}=parseInput(socialDeleteSchema,req.body);success(res,'Social account removed',await service.remove(req.user.id,parseInput(socialIdSchema,req.params.id),revision,req.id));}
};
