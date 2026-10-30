import request from 'supertest';
import {randomUUID,createHmac} from 'node:crypto';
import {hashPassword} from '../src/utils/password.js';
import {createIsolatedDatabase} from './helpers/isolated-database.js';
const isolated=await createIsolatedDatabase();
const {createApp}=await import('../src/app.js');
const {pool}=await import('../src/config/db.js');
const {callProcedure}=await import('../src/repositories/procedure.repository.js');
const {createRazorpayGateway,validSignature}=await import('../src/services/razorpay.gateway.js');

describe('real MySQL funding with deterministic Razorpay transport',()=>{
 const users={},tokens={},campaigns=[],orders=new Map(),payments=new Map();
 const keyId='rzp_test_Synthetic',secret='synthetic-test-secret-only',webhookSecret='synthetic-webhook-secret-only';
 let app,gateway,createCount=0,failure=null;
 const headers=(role='BRAND_ADMIN')=>({Authorization:`Bearer ${tokens[role]}`,'X-Requested-With':'InfluenceWeb'});
 const base=c=>`/api/v1/brand/campaigns/${c}/funding`;
 const read=(c,role='BRAND_ADMIN')=>request(app).get(base(c)).set(headers(role));
 const start=(c,extra={},role='BRAND_ADMIN')=>request(app).post(base(c)+'/order').set(headers(role)).send({revision:1,...extra});
 const refresh=c=>request(app).post(base(c)+'/refresh').set(headers()).send({});
 const sig=(value,s=secret)=>createHmac('sha256',s).update(value).digest('hex');
 async function make(extra={},status='APPROVED'){
  const r=await request(app).post('/api/v1/brand/campaigns').set(headers()).send({title:'Synthetic funding campaign',currency:'INR',totalBudget:'1234.09',...extra}).expect(201),c=r.body.data.campaign;
  campaigns.push(c.id);await pool.execute('UPDATE campaigns SET status=? WHERE id=?',[status,c.id]);return c.id;
 }
 async function fundedOrder(){const c=await make(),r=await start(c).expect(200);return {c,f:r.body.data.funding};}
 function payment(f,status='captured',extra={}){const p={id:'pay_'+randomUUID().replaceAll('-',''),order_id:f.orderId,amount:Number(f.amountMinor),currency:'INR',status,captured:status==='captured',...extra};payments.set(p.id,p);return p;}
 const verify=(c,f,p,extra={})=>request(app).post(base(c)+'/verify').set(headers()).send({razorpay_order_id:f.orderId,razorpay_payment_id:p.id,razorpay_signature:sig(`${f.orderId}|${p.id}`),...extra});
 const webhook=(p,event='payment.captured',id='evt_'+randomUUID(),extra={})=>{
  const raw=JSON.stringify({event,payload:{payment:{entity:p}},...extra});
  return request(app).post('/api/v1/payments/razorpay/webhook').set('Content-Type','application/json').set('X-Razorpay-Event-Id',id).set('X-Razorpay-Signature',sig(raw,webhookSecret)).send(raw);
 };
 beforeAll(async()=>{const hash=await hashPassword('Funding-test-password-2026',10);for(const role of ['BRAND_ADMIN','OTHER_BRAND','CREATOR','SUPER_ADMIN']){const id=randomUUID(),email=`funding-${id}@example.invalid`,dbRole=role==='OTHER_BRAND'?'BRAND_ADMIN':role;await callProcedure('sp_create_user',[id,dbRole,`Funding ${role}`,email,hash,dbRole==='BRAND_ADMIN'?'Synthetic funding company':null]);users[role]={id,email};const r=await request(createApp({logging:false})).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email,password:'Funding-test-password-2026'}).expect(200);tokens[role]=r.body.data.accessToken;}},20000);
 beforeEach(()=>{
  failure=null;
  gateway=createRazorpayGateway({keyId,keySecret:secret,webhookSecret,fetcher:async(url,options)=>{
   const path=new URL(url).pathname.replace('/v1/',''),query=new URL(url).searchParams;let result;
   if(options.headers.Authorization!==`Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`)throw new Error('Bad test authentication');
   if(path==='orders'&&options.method==='POST'){
    createCount++;const body=JSON.parse(options.body);result={...body,id:'order_'+randomUUID().replaceAll('-',''),status:'created'};
    orders.set(result.id,result);if(failure==='timeout')throw new Error('Synthetic ambiguous network failure');if(failure==='bad-order')result={...result,amount:1};
   }else if(path==='orders'){result={items:[...orders.values()].filter(o=>o.receipt===query.get('receipt'))};}
   else if(path.startsWith('payments/'))result=payments.get(path.split('/')[1]);
   else if(path.endsWith('/payments'))result={items:[...payments.values()].filter(p=>p.order_id===path.split('/')[1])};
   else result=orders.get(path.split('/')[1]);
   return new Response(JSON.stringify(result??{}),{status:200,headers:{'Content-Type':'application/json'}});
  }});app=createApp({logging:false,paymentGateway:gateway});
 });
 afterAll(async()=>{await pool.end();await isolated.drop();});
 test('private history is active owner-only; missing keys and live keys fail closed without reserving funds',async()=>{
  const c=await make();await request(app).get(base(c)).expect(401);await read(c,'OTHER_BRAND').expect(404);await start(c,{},'CREATOR').expect(403);await read(c,'SUPER_ADMIN').expect(403);
  app=createApp({logging:false,paymentGateway:createRazorpayGateway({keyId:'rzp_live_Disallowed',keySecret:secret,webhookSecret})});expect((await read(c).expect(200)).body.data.configuration.configured).toBe(false);await start(c).expect(503);expect((await read(c).expect(200)).body.data.funding).toBeNull();
 });
 test('fund only approved active INR campaigns; no funding edits, supplied amount or spoofed owner',async()=>{
  for(const status of ['DRAFT','PENDING_APPROVAL','REJECTED','CANCELLED','COMPLETED','EXPIRED'])await start(await make({},status)).expect(409);
  for(const input of [{currency:'USD'},{totalBudget:null},{totalBudget:'0.99'}])await start(await make(input)).expect(409);
  const c=await make();for(const extra of [{amount:1},{currency:'USD'},{brandId:users.OTHER_BRAND.id},{revision:'1'},{revision:0}])await start(c,extra).expect(422);await start(c,{revision:2}).expect(409);await start(c).set('Origin','https://foreign.example').expect(403);
 });
 test('one exact integer-principal order per campaign; repeated and competing starts reuse it',async()=>{
  const c=await make(),before=createCount,r=await Promise.all([start(c),start(c)]);expect(r.map(x=>x.status)).toEqual([200,200]);const d=(await read(c).expect(200)).body.data;expect(d.funding).toMatchObject({amountMinor:123409,currency:'INR',status:'PENDING'});expect(orders.get(d.funding.orderId)).toMatchObject({amount:123409,receipt:d.funding.id,partial_payment:false});await start(c).expect(200);expect(createCount-before).toBe(1);expect((await read(c).expect(200)).headers['cache-control']).toBe('no-store');
  const large=await make({totalBudget:'999999999.99'});expect((await start(large).expect(200)).body.data.funding.amountMinor).toBe(99999999999);
 });
 test('checkout HMAC and authoritative amount/currency/order/capture state are mandatory',async()=>{
  const {c,f}=await fundedOrder(),p=payment(f);await verify(c,f,p,{razorpay_signature:'0'.repeat(64)}).expect(422);
  for(const changes of [{amount:1},{currency:'USD'},{order_id:'order_Foreign'},{captured:false}]){const wrong=payment(f,'captured',changes);await verify(c,f,wrong).expect(409);}
  await verify(c,f,p,{razorpay_order_id:'order_Foreign'}).expect(422);expect((await read(c).expect(200)).body.data.attempts).toEqual([]);await verify(c,f,p).expect(200);expect((await read(c).expect(200)).body.data.funding.status).toBe('SUCCEEDED');
 });
 test('authorized is pending; capture is terminal and records one safe funding audit',async()=>{
  const {c,f}=await fundedOrder(),p=payment(f,'authorized');await verify(c,f,p).expect(200);expect((await read(c).expect(200)).body.data.funding.status).toBe('PENDING');p.status='captured';p.captured=true;await Promise.all([verify(c,f,p).expect(200),refresh(c).expect(200)]);await webhook(p).expect(200);
  const [[row]]=await pool.execute("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id=? AND action='CAMPAIGN_FUNDED'",[c]);expect(row.n).toBe(1);expect((await read(c).expect(200)).body.data.attempts).toHaveLength(1);
 });
 test('failed attempts are retained and retry the same order; delayed failures cannot undo success',async()=>{
  const {c,f}=await fundedOrder(),failed=payment(f,'failed');await webhook(failed,'payment.failed').expect(200);let d=(await read(c).expect(200)).body.data;expect(d.attempts[0].status).toBe('FAILED');expect(d.funding.status).toBe('PENDING');expect((await start(c).expect(200)).body.data.funding.orderId).toBe(f.orderId);
  const paid=payment(f);await verify(c,f,paid).expect(200);await webhook(failed,'payment.failed').expect(200);d=(await read(c).expect(200)).body.data;expect(d.attempts).toHaveLength(2);expect(d.funding.status).toBe('SUCCEEDED');expect(d.canFund).toBe(false);
 });
 test('raw webhook signatures, event uniqueness and current provider state withstand replay and reordering',async()=>{
  const {c,f}=await fundedOrder(),p=payment(f),id='evt_'+randomUUID();await webhook(p).set('X-Razorpay-Signature','f'.repeat(64)).expect(400);await webhook(p).set('X-Razorpay-Event-Id','').expect(422);await webhook(p,'payment.captured',id).expect(200);await webhook(p,'payment.captured',id).expect(200);await webhook(p,'payment.captured',id,{extra:'changed bytes'}).expect(409);
  const delayed={...p,status:'failed',captured:false};await webhook(delayed,'payment.failed').expect(200);expect((await read(c).expect(200)).body.data.funding.status).toBe('SUCCEEDED');const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM campaign_payment_events WHERE event_id=?',[id]);expect(n.n).toBe(1);
 });
 test('unknown order webhooks retry; unrelated events are ignored; provider mismatches roll back events',async()=>{
  await webhook({id:'pay_Unknown',order_id:'order_Unknown'}).expect(503);await webhook({},'subscription.activated').expect(200);await webhook({},'refund.created').expect(422);const {c,f}=await fundedOrder(),p=payment(f,'captured',{amount:1}),event='evt_'+randomUUID();await webhook(p,'payment.captured',event).expect(409);const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM campaign_payment_events WHERE event_id=?',[event]);expect(n.n).toBe(0);expect((await read(c).expect(200)).body.data.funding.status).toBe('PENDING');
 });
 test('ambiguous creation never creates another order; receipt lookup recovers the original',async()=>{
  const c=await make(),before=createCount;failure='timeout';await start(c).expect(502);let d=(await read(c).expect(200)).body.data;expect(d.funding.status).toBe('SETUP_REVIEW');expect(d.funding.orderId).toBeNull();await start(c).expect(200);expect(createCount-before).toBe(1);failure=null;await refresh(c).expect(200);d=(await read(c).expect(200)).body.data;expect(d.funding.status).toBe('PENDING');expect(d.funding.orderId).toBeTruthy();expect(createCount-before).toBe(1);
 });
 test('missing recovery receipt or wrong provider response cannot be automatically replaced',async()=>{
  const c=await make();failure='bad-order';await start(c).expect(409);const d=(await read(c).expect(200)).body.data;for(const [id,o] of orders)if(o.receipt===d.funding.id)orders.delete(id);failure=null;await refresh(c).expect(409);expect((await read(c).expect(200)).body.data.funding.status).toBe('SETUP_REVIEW');
 });
 test('captured monetary facts remain recordable after cancellation or Brand suspension',async()=>{
  const {c,f}=await fundedOrder(),p=payment(f);await pool.execute("UPDATE campaigns SET status='CANCELLED' WHERE id=?",[c]);await start(c).expect(409);await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[users.BRAND_ADMIN.id]);try{await read(c).expect(401);await webhook(p).expect(200);}finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.BRAND_ADMIN.id]);}expect((await read(c).expect(200)).body.data.funding.status).toBe('SUCCEEDED');
 });
 test('changed test keys cannot reuse or reconcile another account order; secrets never projected',async()=>{
  const {c}=await fundedOrder();app=createApp({logging:false,paymentGateway:createRazorpayGateway({keyId:'rzp_test_Different',keySecret:secret,webhookSecret})});await refresh(c).expect(409);const d=(await read(c).expect(200)).body.data;expect(d.canFund).toBe(false);expect(JSON.stringify(d)).not.toContain(secret);expect(JSON.stringify(d)).not.toContain(webhookSecret);expect(d).not.toHaveProperty('wallet');
 });
 test('HMAC comparisons handle malformed input and missing write protection',async()=>{
  expect(validSignature(secret,'payload','wrong')).toBe(false);expect(validSignature('', 'payload','0'.repeat(64))).toBe(false);const c=await make();await request(app).post(base(c)+'/order').set('Authorization',`Bearer ${tokens.BRAND_ADMIN}`).send({revision:1}).expect(403);await read(c).query({actorId:users.OTHER_BRAND.id}).expect(422);await request(app).get('/api/v1/creator/campaigns/'+c+'/funding').set(headers('CREATOR')).expect(404);
 });
});

