import {z} from 'zod';
import {applicationService as service} from '../services/campaign-application.service.js';
import {applicationSubmit,applicationWithdraw,applicationQuery} from '../validators/campaign-application.validator.js';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {success} from '../utils/response.js';
function id(req){parseInput(emptyQuery,req.query);return parseInput(z.uuid(),req.params.id);}
export const applicationController={
 eligibility:async(req,res)=>success(res,'Application eligibility',await service.eligibility(req.user.id,id(req))),
 apply:async(req,res)=>{const result=await service.apply(req.user.id,id(req),parseInput(applicationSubmit,req.body),req.id);res.status(201);success(res,'Application submitted',result);},
 list:async(req,res)=>{const r=await service.list(req.user.id,parseInput(applicationQuery,req.query));success(res,'Your applications',{items:r.items},r.meta);},
 get:async(req,res)=>success(res,'Your application',await service.get(req.user.id,id(req))),
 withdraw:async(req,res)=>success(res,'Application withdrawn',await service.withdraw(req.user.id,id(req),parseInput(applicationWithdraw,req.body),req.id))
};
