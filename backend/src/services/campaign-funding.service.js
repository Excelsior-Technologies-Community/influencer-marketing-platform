import {randomUUID,createHash} from 'node:crypto';
import {callProcedure,callProcedureSets} from '../repositories/procedure.repository.js';
import {ApiError} from '../utils/api-error.js';
import {createRefundService} from './campaign-refund.service.js';

const allowed=['APPROVED','LIVE','PAUSED','APPLICATION_CLOSED','IN_PROGRESS'];
const providerId=(s,prefix)=>typeof s==='string'&&new RegExp(`^${prefix}_[A-Za-z0-9]{1,64}$`).test(s);
export function createFundingService(gateway){
 async function read(actor,campaign){
  const [campaigns,fundings,attempts]=await callProcedureSets('sp_funding_read',[actor,campaign]);
  const c=campaigns[0],f=fundings[0]??null;
  return {campaign:c,funding:f,attempts,configuration:{provider:'RAZORPAY',mode:'TEST',currency:'INR',configured:gateway.ready},canFund:gateway.ready&&allowed.includes(c.status)&&c.currency==='INR'&&c.totalBudget!==null&&Number(c.totalBudget)>=1&&(!f||f.status==='PENDING')&&(!f||f.keyId===gateway.keyId)};
 }
 function assertKey(f){gateway.assertReady();if(f.keyId!==gateway.keyId)throw new ApiError(409,'This funding order belongs to a different test key. Restore its original Test Mode credentials to reconcile it.');}
 function assertOrder(o,f){if(!o||!providerId(o.id,'order')||o.receipt!==f.id||String(o.amount)!==String(f.amountMinor)||o.currency!=='INR'||o.partial_payment===true||f.orderId&&o.id!==f.orderId)throw new ApiError(409,'Razorpay order does not match this campaign funding record.');}
 async function record(f,p,request,event=null){
  const statuses={captured:'CAPTURED',authorized:'AUTHORIZED',failed:'FAILED'};
  if(!p||!providerId(p.id,'pay')||p.order_id!==f.orderId||String(p.amount)!==String(f.amountMinor)||p.currency!=='INR'||!statuses[p.status]||p.status==='captured'&&p.captured!==true)throw new ApiError(409,'Payment amount, currency, order or state does not match this funding record.');
  await callProcedure('sp_funding_record_payment',[f.id,f.orderId,p.id,statuses[p.status],p.amount,p.currency,event?.id??null,event?.hash??null,event?.type??null,request]);
 }
 async function attach(f,o,request){assertOrder(o,f);await callProcedure('sp_funding_attach_order',[f.id,o.id,o.amount,o.currency,request]);return {...f,orderId:o.id,status:'PENDING'};}
 return {
  read,
  async create(actor,campaign,revision,request){
   await read(actor,campaign);gateway.assertReady();
   const [f]=await callProcedure('sp_funding_reserve',[actor,campaign,revision,randomUUID(),gateway.keyId,request]);assertKey(f);
   if(f.isNew){try{await attach(f,await gateway.createOrder(f),request);}catch(e){await callProcedure('sp_funding_setup_review',[f.id]);throw e;}}
   return read(actor,campaign);
  },
  async verify(actor,campaign,input,request){
   const {funding:f}=await read(actor,campaign);if(!f?.orderId)throw new ApiError(409,'Create a funding order first.');assertKey(f);
   if(input.razorpay_order_id!==f.orderId||!gateway.verifyCheckout(f.orderId,input.razorpay_payment_id,input.razorpay_signature))throw new ApiError(422,'Payment signature is invalid. Check payment status instead.');
   const payment=await gateway.getPayment(input.razorpay_payment_id);if(payment.id!==input.razorpay_payment_id)throw new ApiError(409,'Payment identity does not match.');
   await record(f,payment,request);return read(actor,campaign);
  },
  async refresh(actor,campaign,request){
   let {funding:f}=await read(actor,campaign);if(!f)throw new ApiError(409,'No funding order has been started.');assertKey(f);
   if(!f.orderId){const result=await gateway.findOrders(f.id),orders=(result.items??[]).filter(o=>o.receipt===f.id);if(orders.length!==1)throw new ApiError(409,'Order setup needs reconciliation. No new order will be created automatically; check the receipt in Razorpay Test Mode and retry status checking.');f=await attach(f,orders[0],request);}
   assertOrder(await gateway.getOrder(f.orderId),f);
   const result=await gateway.getOrderPayments(f.orderId);if(!Array.isArray(result.items)||result.items.length>100)throw new ApiError(502,'Payment history could not be reconciled.');
   for(const p of result.items)if(['captured','authorized','failed'].includes(p.status))await record(f,p,request);
   return read(actor,campaign);
  },
  async webhook(body,signature,eventId,request){
   gateway.assertReady();if(!Buffer.isBuffer(body)||!gateway.verifyWebhook(body,signature))throw new ApiError(400,'Invalid webhook signature');
   if(typeof eventId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(eventId))throw new ApiError(422,'Webhook event ID is required');
   let event;try{event=JSON.parse(body.toString('utf8'));}catch{throw new ApiError(400,'Invalid webhook body');}
   if(['refund.created','refund.processed','refund.failed'].includes(event.event))return createRefundService(gateway).webhook(event,eventId,createHash('sha256').update(body).digest('hex'),request);
   if(!['payment.captured','payment.failed','payment.authorized','order.paid'].includes(event.event))return {ignored:true};
   const p=event.payload?.payment?.entity;if(!p||!providerId(p.id,'pay')||!providerId(p.order_id,'order'))throw new ApiError(422,'Payment identity missing from webhook');
   const [f]=await callProcedure('sp_funding_order_lookup',[p.order_id]);if(!f)throw new ApiError(503,'Funding order not attached yet. Retry delivery later.');assertKey(f);
   // Fetch the current authoritative payment state; delayed failures cannot undo capture.
   const payment=await gateway.getPayment(p.id);if(payment.id!==p.id)throw new ApiError(409,'Payment identity does not match.');
   await record(f,payment,request,{id:eventId,hash:createHash('sha256').update(body).digest('hex'),type:event.event});return {received:true};
  }
 };
}
