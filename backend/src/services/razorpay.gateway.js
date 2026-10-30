import {createHmac,timingSafeEqual} from 'node:crypto';
import {env} from '../config/env.js';
import {ApiError} from '../utils/api-error.js';

export function validSignature(secret,message,signature){
 if(!secret||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;
 return timingSafeEqual(createHmac('sha256',secret).update(message).digest(),Buffer.from(signature,'hex'));
}
export function createRazorpayGateway({keyId=env.RAZORPAY_KEY_ID,keySecret=env.RAZORPAY_KEY_SECRET,webhookSecret=env.RAZORPAY_WEBHOOK_SECRET,fetcher=fetch}={}){
 const ready=/^rzp_test_[A-Za-z0-9]+$/.test(keyId)&&Boolean(keySecret)&&webhookSecret.length>=20;
 function assertReady(){if(!ready)throw new ApiError(503,'Razorpay Test Mode is not configured. Add the test keys and webhook secret to backend/.env, then restart the API.');}
 async function api(path,body,headers={}){
  assertReady();let response;
  try{response=await fetcher(`https://api.razorpay.com/v1/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'error'});}
  catch{throw new ApiError(502,'Razorpay did not respond. Use Check payment status before trying again.');}
  if(!response.ok)throw new ApiError(502,'Razorpay could not process this request. Check the Test Mode keys and account settings, then check payment status.');
  try{return await response.json();}catch{throw new ApiError(502,'Razorpay returned an unreadable response. Check payment status.');}
 }
 return {keyId,ready,assertReady,
  createOrder:funding=>api('orders',{amount:Number(funding.amountMinor),currency:'INR',receipt:funding.id,partial_payment:false}),
  findOrders:id=>api(`orders?receipt=${encodeURIComponent(id)}&count=100`),
  getOrder:id=>api(`orders/${encodeURIComponent(id)}`),
  getPayment:id=>api(`payments/${encodeURIComponent(id)}`),
  getOrderPayments:id=>api(`orders/${encodeURIComponent(id)}/payments`),
  createRefund:refund=>api(`payments/${encodeURIComponent(refund.paymentId)}/refund`,{amount:Number(refund.amountMinor),speed:'normal',receipt:refund.id},{'X-Refund-Idempotency':refund.id}),
  getRefund:id=>api(`refunds/${encodeURIComponent(id)}`),
  getPaymentRefunds:(id,skip=0)=>api(`payments/${encodeURIComponent(id)}/refunds?count=100&skip=${skip}`),
  verifyCheckout:(order,payment,signature)=>validSignature(keySecret,`${order}|${payment}`,signature),
  verifyWebhook:(body,signature)=>ready&&validSignature(webhookSecret,body,signature)
 };
}
