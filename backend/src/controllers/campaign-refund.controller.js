import {z} from 'zod';
import {parseInput} from '../middlewares/validate.middleware.js';
import {emptyQuery} from '../validators/brand.validator.js';
import {success} from '../utils/response.js';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {createRefundService} from '../services/campaign-refund.service.js';
const id=req=>{parseInput(emptyQuery,req.query);return parseInput(z.uuid(),req.params.id);};
const reason=z.string().trim().min(10).max(500);
export function refundController(gateway){const service=createRefundService(gateway);return {
 read:async(req,res)=>success(res,'Campaign refunds',await service.read(req.user.id,id(req))),
 create:async(req,res)=>{const c=id(req),v=parseInput(z.strictObject({revision:z.number().int().min(0),reason}),req.body);success(res,'Test refund request recorded',await service.create(req.user.id,c,v.revision,v.reason,req.id));},
 refresh:async(req,res)=>{const c=id(req);parseInput(z.strictObject({}),req.body??{});success(res,'Refund status checked',await service.refresh(req.user.id,c,req.id));},
 review:async(req,res)=>{const c=id(req),v=parseInput(z.strictObject({amountMinor:z.string().regex(/^[1-9][0-9]{0,10}$/).refine(x=>BigInt(x)<=99999999999n),reason}),req.body);success(res,'Manual review requested',await service.requestReview(req.user.id,c,v.amountMinor,v.reason,req.id));}
};}
export const refundReviewController={
 list:async(req,res)=>{const q=parseInput(z.strictObject({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10)}),req.query),[items,counts]=await callProcedureSets('sp_admin_payment_reviews',[req.user.id,q.pageSize,(q.page-1)*q.pageSize]);success(res,'Payment review cases',{items},{...q,total:Number(counts[0].total),totalPages:Math.ceil(Number(counts[0].total)/q.pageSize)});},
 note:async(req,res)=>{const caseId=id(req),v=parseInput(z.strictObject({revision:z.number().int().min(1),action:z.enum(['NOTE','DECLINE']),reason}),req.body);await callProcedure('sp_admin_payment_review_note',[req.user.id,caseId,v.revision,v.action,v.reason,req.id]);success(res,'Review updated');}
};
