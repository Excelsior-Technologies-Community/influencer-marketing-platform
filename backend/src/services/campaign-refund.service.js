import {randomUUID} from 'node:crypto';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {ApiError} from '../utils/api-error.js';
const providerId=(v,prefix)=>typeof v==='string'&&new RegExp(`^${prefix}_[A-Za-z0-9]{1,64}$`).test(v);
export function createRefundService(gateway){
 function key(f){gateway.assertReady();if(f.keyId!==gateway.keyId)throw new ApiError(409,'Restore the Test Mode keys used for this payment before checking its refund.');}
 async function read(actor,campaign){const [campaigns,refunds,history,reviews]=await callProcedureSets('sp_refund_read',[actor,campaign]);const c=campaigns[0];return {campaign:{id:c.id,title:c.title,status:c.status,revision:c.revision,amountMinor:c.amountMinor,currency:c.currency},refund:refunds[0]??null,history,reviews,canRefund:Boolean(c.canRefund)&&gateway.ready&&c.keyId===gateway.keyId};}
 async function source(payment){const [f]=await callProcedure('sp_refund_payment_lookup',[payment]);if(!f)throw new ApiError(503,'Captured payment is not recorded yet. Retry refund reconciliation later.');key(f);return f;}
 async function observe(f,r,request,event=null){
  const states={pending:'PENDING',processed:'PROCESSED',failed:'FAILED'};
  if(!r||!providerId(r.id,'rfnd')||r.payment_id!==f.paymentId||r.currency!=='INR'||!Number.isSafeInteger(r.amount)||r.amount<1||BigInt(r.amount)>BigInt(f.amountMinor)||!Object.hasOwn(states,r.status))throw new ApiError(409,'Refund identity, payment, amount, currency or state does not match.');
  if(f.receipt&&r.receipt===f.receipt&&String(r.amount)===String(f.amountMinor)&&(!f.refundId||r.id===f.refundId)){
   await callProcedure('sp_refund_record',[f.receipt,r.id,f.paymentId,r.amount,r.currency,states[r.status],r.receipt,event?.id??null,event?.hash??null,event?.type??null,request]);
  }else await callProcedure('sp_refund_flag_external',[f.id,r.id,r.amount,states[r.status],event?.id??null,event?.hash??null,event?.type??null,request]);
 }
 async function scan(f,request){
  for(let skip=0;skip<1000;skip+=100){const result=await gateway.getPaymentRefunds(f.paymentId,skip);if(!Array.isArray(result.items)||result.items.length>100)throw new ApiError(502,'Refund history could not be checked.');
   for(const r of result.items){if(!providerId(r?.id,'rfnd'))throw new ApiError(409,'Invalid refund reference.');const authoritative=await gateway.getRefund(r.id);if(authoritative.id!==r.id)throw new ApiError(409,'Refund identity does not match.');await observe(f,authoritative,request);}
   if(result.items.length<100)return;
  }
  throw new ApiError(409,'Refund history requires manual reconciliation. No new refund was sent.');
 }
 return {read,
  async create(actor,campaign,revision,reason,request){
   await read(actor,campaign);gateway.assertReady();
   const [intent]=await callProcedure('sp_refund_reserve',[actor,campaign,revision,randomUUID(),reason,request]);key(intent);
   if(intent.isNew){try{
    const f=await source(intent.paymentId);await scan(f,request);
    const next=await read(actor,campaign);if(next.reviews.some(x=>x.status==='OPEN'))throw new ApiError(409,'An existing provider refund requires manual review. No new refund was sent.');
    const p=await gateway.getPayment(intent.paymentId);
    if(p.id!==intent.paymentId||String(p.amount)!==String(intent.amountMinor)||p.currency!=='INR'||p.captured!==true||!['captured','refunded'].includes(p.status)||p.amount_refunded!==undefined&&p.amount_refunded!==0)throw new ApiError(409,'Payment needs reconciliation before a refund can be sent.');
    await observe(f,await gateway.createRefund(intent),request);
    await callProcedure('sp_refund_setup_review',[intent.id]);
   }catch(e){await callProcedure('sp_refund_setup_review',[intent.id]);throw e;}}
   return read(actor,campaign);
  },
  async refresh(actor,campaign,request){
   const [rows]=await callProcedureSets('sp_refund_read',[actor,campaign]);const c=rows[0];if(!c.paymentId)throw new ApiError(409,'A captured payment is required.');
   const f=await source(c.paymentId);
   if(f.refundId){const r=await gateway.getRefund(f.refundId);if(r.id!==f.refundId)throw new ApiError(409,'Refund identity does not match.');await observe(f,r,request);}
   await scan(await source(c.paymentId),request);return read(actor,campaign);
  },
  async requestReview(actor,campaign,amount,reason,request){await callProcedure('sp_refund_review_request',[actor,campaign,amount,reason,request]);return read(actor,campaign);},
  async webhook(event,eventId,hash,request){
   const entity=event.payload?.refund?.entity;if(!entity||!providerId(entity.id,'rfnd')||!providerId(entity.payment_id,'pay'))throw new ApiError(422,'Refund identity missing from webhook');
   const f=await source(entity.payment_id),r=await gateway.getRefund(entity.id);if(r.id!==entity.id)throw new ApiError(409,'Refund identity does not match.');
   await observe(f,r,request,{id:eventId,hash,type:event.event});return {received:true};
  }
 };
}
