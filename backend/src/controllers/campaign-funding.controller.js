import {z} from 'zod';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {success} from '../utils/response.js';
import {createFundingService} from '../services/campaign-funding.service.js';
const id=req=>{parseInput(emptyQuery,req.query);return parseInput(z.uuid(),req.params.id);};
const providerId=prefix=>z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{1,64}$`));
const verification=z.strictObject({razorpay_order_id:providerId('order'),razorpay_payment_id:providerId('pay'),razorpay_signature:z.string().regex(/^[a-f0-9]{64}$/)});
export function fundingController(gateway){
 const service=createFundingService(gateway);
 return {
  read:async(req,res)=>success(res,'Campaign funding',await service.read(req.user.id,id(req))),
  create:async(req,res)=>{const campaign=id(req),v=parseInput(z.strictObject({revision:z.number().int().min(1).max(2147483646)}),req.body);success(res,'Test funding order',await service.create(req.user.id,campaign,v.revision,req.id));},
  verify:async(req,res)=>{const campaign=id(req);success(res,'Payment checked',await service.verify(req.user.id,campaign,parseInput(verification,req.body),req.id));},
  refresh:async(req,res)=>{const campaign=id(req);parseInput(z.strictObject({}),req.body??{});success(res,'Payment status checked',await service.refresh(req.user.id,campaign,req.id));},
  webhook:async(req,res)=>{res.setHeader('Cache-Control','no-store');success(res,'Webhook processed',await service.webhook(req.body,req.get('X-Razorpay-Signature'),req.get('X-Razorpay-Event-Id'),req.id));}
 };
}
