import {z} from 'zod';
import {lifecycleService as service} from '../services/campaign-lifecycle.service.js';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {lifecycleAction,lifecycleDelete} from '../validators/campaign-lifecycle.validator.js';
import {success} from '../utils/response.js';
function id(req){parseInput(emptyQuery,req.query);return parseInput(z.uuid(),req.params.id);}
export const lifecycleController={
 get:async(req,res)=>success(res,'Campaign management',await service.get(req.user.id,id(req),req.user.role==='SUPER_ADMIN')),
 change:async(req,res)=>success(res,'Campaign status updated',await service.change(req.user.id,id(req),parseInput(lifecycleAction,req.body),req.id,req.user.role==='SUPER_ADMIN')),
 refresh:async(req,res)=>{parseInput(z.strictObject({}),req.body??{});success(res,'Schedule status refreshed',await service.refresh(req.user.id,id(req),req.id,req.user.role==='SUPER_ADMIN'));},
 remove:async(req,res)=>success(res,'Unused campaign draft deleted',await service.remove(req.user.id,id(req),parseInput(lifecycleDelete,req.body).revision,req.id))
};
