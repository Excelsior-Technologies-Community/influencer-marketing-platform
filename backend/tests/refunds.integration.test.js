import request from 'supertest';
import {randomUUID,createHmac} from 'node:crypto';
import {hashPassword} from '../src/utils/password.js';
import {createIsolatedDatabase} from './helpers/isolated-database.js';
const isolated=await createIsolatedDatabase();
const {createApp}=await import('../src/app.js');
const {pool}=await import('../src/config/db.js');
const {callProcedure}=await import('../src/repositories/procedure.repository.js');
const refunds=new Map(),providerPayments=new Map(),users={},tokens={};let platform,type,createCount=0,mode='pending';
const webhookSecret='synthetic-refund-webhook-secret';
const gateway={ready:true,keyId:'rzp_test_Synthetic',assertReady(){},verifyWebhook:(body,sig)=>createHmac('sha256',webhookSecret).update(body).digest('hex')===sig,
getPayment:async id=>providerPayments.get(id),getRefund:async id=>refunds.get(id),getPaymentRefunds:async(id,skip=0)=>({items:[...refunds.values()].filter(x=>x.payment_id===id).slice(skip,skip+100)}),
createRefund:async intent=>{createCount++;const r={id:'rfnd_'+randomUUID().replaceAll('-',''),payment_id:intent.paymentId,amount:Number(intent.amountMinor),currency:'INR',receipt:intent.id,status:mode==='processed'?'processed':'pending'};refunds.set(r.id,r);if(mode==='timeout')throw new Error('Synthetic ambiguous refund timeout');return r;}};
const app=createApp({logging:false,paymentGateway:gateway});
const headers=(role='BRAND_ADMIN')=>({Authorization:`Bearer ${tokens[role]}`,'X-Requested-With':'InfluenceWeb'});
const path=c=>`/api/v1/brand/campaigns/${c}/refunds`;
const read=(c,role='BRAND_ADMIN')=>request(app).get(path(c)).set(headers(role));
const release=(c,extra={},role='BRAND_ADMIN')=>request(app).post(path(c)).set(headers(role)).send({revision:1,reason:'Cancelled campaign full refund request.',...extra});
const wallet=(role='BRAND_ADMIN')=>request(app).get(`/api/v1/${role.includes('BRAND')?'brand':'creator'}/wallet`).set(headers(role));
// Deterministic completion/capture fixtures in a disposable schema. No external charges.
async function fixture({amount=123409,count=2,status='CANCELLED',capture=true,approved=true}={}){
 const c=(await request(app).post('/api/v1/brand/campaigns').set(headers()).send({title:'Synthetic Creator release campaign',currency:'INR',totalBudget:`${Math.floor(amount/100)}.${String(amount%100).padStart(2,'0')}`,creatorSlots:count,platformIds:[platform],contentTypeIds:[type],deliverables:[{platformId:platform,contentTypeId:type,quantity:1,description:'One original video'}]}).expect(201)).body.data.campaign.id;
 const f=randomUUID(),order='order_'+randomUUID().replaceAll('-',''),pay='pay_'+randomUUID().replaceAll('-','');
 await pool.execute('UPDATE campaigns SET status=? WHERE id=?',[status,c]);
 for(let n=0;n<count;n++){
  const user=users[n?'OTHER_CREATOR':'CREATOR'],a=randomUUID(),s=randomUUID();
  const [[cr]]=await pool.execute('SELECT id FROM creators WHERE user_id=?',[user.id]);
  await pool.execute("INSERT INTO campaign_applications(id,campaign_id,creator_id,pitch,status) VALUES(?,?,?,'Synthetic release fixture','APPROVED')",[a,c,cr.id]);
  await pool.execute('INSERT INTO campaign_creator_allocations(application_id,campaign_id,creator_id,allocated_by,allocated_at) VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND))',[a,c,cr.id,users.BRAND_ADMIN.id,n]);
  await pool.execute("INSERT INTO content_submissions(id,application_id,campaign_id,platform_id,content_type_id,unit_number,content_url,caption,published_at,notes,status) VALUES(?,?,?,?,?,1,'https://example.com/fixture','Synthetic #ad',UTC_TIMESTAMP(3),'','APPROVED')",[s,a,c,platform,type]);
  await pool.execute("INSERT INTO content_submission_versions(submission_id,version,content_url,caption,published_at,notes,status,change_type,reason,actor_user_id) SELECT id,1,content_url,caption,published_at,notes,status,'INITIAL','Synthetic test fixture',? FROM content_submissions WHERE id=?",[user.id,s]);
  if(approved)await pool.execute("INSERT INTO content_submission_reviews(submission_id,content_version,decision,from_status,to_status,reason,actor_user_id) VALUES(?,1,'APPROVE','SUBMITTED','APPROVED','Synthetic approved content',?)",[s,users.BRAND_ADMIN.id]);
 }
 await pool.execute("INSERT INTO campaign_funding(id,campaign_id,amount_minor,currency,provider_key_id,provider_order_id,status) VALUES(?,?,?,'INR','rzp_test_Synthetic',?,'PENDING')",[f,c,amount,order]);
 if(capture)await callProcedure('sp_funding_record_payment',[f,order,pay,'CAPTURED',amount,'INR',null,null,'CHECKOUT',randomUUID()]);
 providerPayments.set(pay,{id:pay,order_id:order,amount,currency:'INR',status:'captured',captured:true,amount_refunded:0});return {c,f,order,pay,amount};
}
beforeAll(async()=>{
 const hash=await hashPassword('Release-test-password-2026',10);
 for(const role of ['BRAND_ADMIN','OTHER_BRAND','CREATOR','OTHER_CREATOR','SUPER_ADMIN']){const id=randomUUID(),email=`release-${id}@example.invalid`,dbRole=role==='OTHER_BRAND'?'BRAND_ADMIN':role==='OTHER_CREATOR'?'CREATOR':role;await callProcedure('sp_create_user',[id,dbRole,`Release ${role}`,email,hash,dbRole==='BRAND_ADMIN'?'Release test Brand':null]);users[role]={id,email};const r=await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email,password:'Release-test-password-2026'}).expect(200);tokens[role]=r.body.data.accessToken;}
 [[{id:platform}]]=await pool.query('SELECT id FROM platforms ORDER BY id LIMIT 1');[[{id:type}]]=await pool.query('SELECT id FROM content_types ORDER BY id LIMIT 1');
},20000);
afterAll(async()=>{await pool.end();await isolated.drop();});
beforeEach(()=>{mode='pending';});
const refresh=c=>request(app).post(path(c)+'/refresh').set(headers()).send({});
const review=(c,extra={},role='BRAND_ADMIN')=>request(app).post(path(c)+'/review').set(headers(role)).send({amountMinor:'100',reason:'Please review a partial refund for this campaign.',...extra});
const adminReviews=()=>request(app).get('/api/v1/admin/payment-reviews').set(headers('SUPER_ADMIN'));
const note=(id,revision,action='NOTE',role='SUPER_ADMIN')=>request(app).post(`/api/v1/admin/payment-reviews/${id}/notes`).set(headers(role)).send({revision,action,reason:'Reviewed this payment exception and retained the financial history.'});
const webhook=(r,event='refund.processed',eventId='evt_'+randomUUID(),extra={})=>{const raw=JSON.stringify({event,payload:{refund:{entity:r}},...extra});return request(app).post('/api/v1/payments/razorpay/webhook').set('Content-Type','application/json').set('X-Razorpay-Event-Id',eventId).set('X-Razorpay-Signature',createHmac('sha256',webhookSecret).update(raw).digest('hex')).send(raw);};
test('pending refund keeps funds held; processed refund posts one balanced reverse journal',async()=>{
 const {c,f}=await fixture();expect((await read(c).expect(200)).body.data.canRefund).toBe(true);const before=(await wallet().expect(200)).body.data.wallet;
 const pending=(await release(c).expect(200)).body.data;expect(pending.refund.status).toBe('PENDING');expect((await wallet().expect(200)).body.data.wallet.balanceMinor).toBe(before.balanceMinor);
 const r=refunds.get(pending.refund.refundId);r.status='processed';await refresh(c).expect(200);
 const after=(await wallet().expect(200)).body.data.wallet;expect(BigInt(before.balanceMinor)-BigInt(after.balanceMinor)).toBe(123409n);expect((await read(c).expect(200)).body.data.history.map(x=>x.status)).toEqual(['CREATING','PENDING','PROCESSED']);
 const [entries]=await pool.execute("SELECT e.direction,CAST(e.amount_minor AS CHAR) AS amount,a.account_type FROM wallet_entries e JOIN wallet_journals j ON j.id=e.journal_id JOIN wallet_accounts a ON a.id=e.account_id WHERE j.funding_id=? AND j.event_type='REFUND_PROCESSED'",[f]);expect(entries).toHaveLength(2);expect(entries).toEqual(expect.arrayContaining([{direction:'DEBIT',amount:'123409',account_type:'BRAND_HELD'},{direction:'CREDIT',amount:'123409',account_type:'PROCESSOR_CLEARING'}]));
});
test('concurrent requests, signed callbacks, refresh and capture replay do not duplicate refunds',async()=>{
 const x=await fixture(),before=createCount;await Promise.all([release(x.c).expect(200),release(x.c).expect(200)]);expect(createCount-before).toBe(1);
 const row=(await read(x.c).expect(200)).body.data.refund,r=refunds.get(row.refundId);r.status='processed';const event='evt_'+randomUUID();await Promise.all([webhook(r,'refund.processed',event).expect(200),refresh(x.c).expect(200)]);await webhook(r,'refund.processed',event).expect(200);await release(x.c).expect(200);expect(createCount-before).toBe(1);
 await callProcedure('sp_funding_record_payment',[x.f,x.order,x.pay,'CAPTURED',x.amount,'INR',null,null,'CHECKOUT',randomUUID()]);await pool.query('CALL sp_wallet_backfill_funding()');const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM wallet_journals WHERE funding_id=?',[x.f]);expect(n.n).toBe(2);
 await webhook(r,'refund.processed',event,{changed:true}).expect(409);const [[a]]=await pool.execute("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id=? AND action='REFUND_PROCESSED'",[x.c]);expect(a.n).toBe(1);
});
test('ambiguous provider timeout reserves one request and reconciles receipt without another create',async()=>{
 const {c}=await fixture(),before=createCount;mode='timeout';await release(c).expect(500);const uncertain=(await read(c).expect(200)).body.data;expect(uncertain.refund.status).toBe('SETUP_REVIEW');await release(c).expect(200);expect(createCount-before).toBe(1);const r=[...refunds.values()].find(x=>x.receipt===uncertain.refund.id);r.status='processed';await refresh(c).expect(200);expect((await read(c).expect(200)).body.data.refund.status).toBe('PROCESSED');expect(createCount-before).toBe(1);
});
test('provider failure and delayed notifications cannot invent or remove a processed debit',async()=>{
 const {c}=await fixture();const pending=(await release(c).expect(200)).body.data.refund,r=refunds.get(pending.refundId);r.status='failed';await webhook(r,'refund.failed').expect(200);expect((await read(c).expect(200)).body.data.refund.status).toBe('FAILED');const before=(await wallet().expect(200)).body.data.wallet;
 r.status='pending';await webhook(r,'refund.created').expect(200);expect((await read(c).expect(200)).body.data.refund.status).toBe('FAILED');expect((await wallet().expect(200)).body.data.wallet.balanceMinor).toBe(before.balanceMinor);
 r.status='processed';await webhook(r).expect(200);r.status='failed';await webhook(r,'refund.failed').expect(200);expect((await read(c).expect(200)).body.data.refund.status).toBe('PROCESSED');
});
test('owner, role, cancellation, captured funding, strict inputs and origin are enforced',async()=>{
 const {c}=await fixture();await read(c,'OTHER_BRAND').expect(404);await release(c,{},'OTHER_BRAND').expect(404);await release(c,{},'CREATOR').expect(403);await release(c,{revision:0}).expect(409);for(const extra of [{amountMinor:'1'},{reason:'short'},{revision:'1'},{userId:users.OTHER_BRAND.id}])await release(c,extra).expect(422);await release(c).set('Origin','https://foreign.example').expect(403);await read(c).query({unknown:1}).expect(422);await read(randomUUID()).expect(404);
 for(const options of [{status:'COMPLETED'},{status:'IN_PROGRESS'},{capture:false}]){const x=await fixture(options);await release(x.c).expect(409);}
 await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[users.BRAND_ADMIN.id]);try{await release(c).expect(401);}finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.BRAND_ADMIN.id]);}
});
test('forged callbacks, wrong currency/payment/identity never post a refund',async()=>{
 const {c,f}=await fixture(),p=(await release(c).expect(200)).body.data.refund,r=refunds.get(p.refundId);
 await webhook(r).set('X-Razorpay-Signature','0'.repeat(64)).expect(400);
 for(const patch of [{currency:'USD'},{payment_id:'pay_Foreign'},{amount:0},{id:'rfnd_Wrong'}]){refunds.set(r.id,{...r,...patch,status:'processed'});await refresh(c).expect(409);}refunds.set(r.id,r);
 const [[n]]=await pool.execute("SELECT COUNT(*) AS n FROM wallet_journals WHERE funding_id=? AND event_type='REFUND_PROCESSED'",[f]);expect(n.n).toBe(0);
});
test('partial or unexpected provider refunds create review cases and freeze releases without fabricated debits',async()=>{
 const {c,pay,f}=await fixture({status:'COMPLETED'}),r={id:'rfnd_'+randomUUID().replaceAll('-',''),payment_id:pay,amount:100,currency:'INR',receipt:null,status:'processed'};refunds.set(r.id,r);
 await webhook(r).expect(200);await webhook(r).expect(200);const x=(await read(c).expect(200)).body.data;expect(x.reviews).toHaveLength(1);expect(x.reviews[0]).toMatchObject({kind:'EXTERNAL_REFUND',providerStatus:'PROCESSED',status:'OPEN'});expect((await wallet().expect(200)).body.data.wallet.openPaymentReviews).toBeGreaterThan(0);
 const preview=await request(app).get(`/api/v1/brand/campaigns/${c}/earnings-release`).set(headers()).expect(200);expect(preview.body.data.release.canRelease).toBe(false);await request(app).post(`/api/v1/brand/campaigns/${c}/earnings-release`).set(headers()).send({revision:1}).expect(409);
 await note(x.reviews[0].id,1,'DECLINE').expect(409);await note(x.reviews[0].id,1).expect(200);const [[n]]=await pool.execute("SELECT COUNT(*) AS n FROM wallet_journals WHERE funding_id=? AND event_type='REFUND_PROCESSED'",[f]);expect(n.n).toBe(0);
});
test('manual partial/post-release requests are deduplicated, admin scoped, revisioned and audited',async()=>{
 const {c}=await fixture({status:'COMPLETED'});await Promise.all([review(c).expect(200),review(c).expect(200)]);const r=(await read(c).expect(200)).body.data.reviews;expect(r).toHaveLength(1);await note(r[0].id,1,'NOTE','BRAND_ADMIN').expect(403);await note(r[0].id,0).expect(422);await note(r[0].id,1).expect(200);await note(r[0].id,1).expect(409);await note(r[0].id,2,'DECLINE').expect(200);expect((await read(c).expect(200)).body.data.reviews[0].status).toBe('CLOSED');const a=await adminReviews().expect(200);expect(a.body.data.items.find(x=>x.id===r[0].id).notes).toHaveLength(3);
 await review(c,{amountMinor:'99999999999'}).expect(422);await review(c,{amountMinor:100}).expect(422);
});
test('posting fault rolls back refund status, event, history, audit and wallet; retry succeeds',async()=>{
 const {c,f}=await fixture(),p=(await release(c).expect(200)).body.data.refund,r=refunds.get(p.refundId);r.status='processed';const event='evt_'+randomUUID();
 await pool.query(`CREATE TRIGGER synthetic_refund_fault BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM wallet_journals WHERE id=NEW.journal_id AND funding_id='${f}' AND event_type='REFUND_PROCESSED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;END`);
 try{await webhook(r,'refund.processed',event).expect(409);}finally{await pool.query('DROP TRIGGER synthetic_refund_fault');}
 expect((await read(c).expect(200)).body.data.refund.status).toBe('PENDING');const [[e]]=await pool.execute('SELECT COUNT(*) AS n FROM campaign_payment_events WHERE event_id=?',[event]);expect(e.n).toBe(0);await webhook(r,'refund.processed',event).expect(200);
});
test('posted refund sources and append-only histories cannot be changed or removed',async()=>{
 const {c,f}=await fixture();mode='processed';const r=(await release(c).expect(200)).body.data.refund;
 for(const sql of ["UPDATE campaign_refunds SET status='FAILED' WHERE id=?",'DELETE FROM campaign_refunds WHERE id=?','UPDATE refund_history SET status=\'FAILED\' WHERE refund_id=?','DELETE FROM refund_history WHERE refund_id=?'])await expect(pool.execute(sql,[r.id])).rejects.toMatchObject({sqlMessage:'WALLET_IMMUTABLE'});
 const [[j]]=await pool.execute("SELECT id FROM wallet_journals WHERE funding_id=? AND event_type='REFUND_PROCESSED'",[f]);await expect(pool.execute('DELETE FROM wallet_entries WHERE journal_id=?',[j.id])).rejects.toMatchObject({sqlMessage:'WALLET_IMMUTABLE'});expect((await read(c).expect(200)).headers['cache-control']).toBe('no-store');
});
test('earnings already released require manual review and are never automatically clawed back',async()=>{
 const {c}=await fixture({status:'COMPLETED'});await request(app).post(`/api/v1/brand/campaigns/${c}/earnings-release`).set(headers()).send({revision:1}).expect(200);
 const before=(await wallet('CREATOR').expect(200)).body.data.wallet;await release(c).expect(409);await review(c,{amountMinor:'123409'}).expect(200);
 expect((await wallet('CREATOR').expect(200)).body.data.wallet.balanceMinor).toBe(before.balanceMinor);
 await pool.execute("UPDATE campaigns SET status='CANCELLED' WHERE id=?",[c]);await release(c).expect(409);
});
test('an existing provider refund prevents another automatic refund request',async()=>{
 const {c,pay}=await fixture();refunds.set('rfnd_'+pay.slice(4),{id:'rfnd_'+pay.slice(4),payment_id:pay,amount:10,currency:'INR',receipt:null,status:'pending'});const before=createCount;
 await release(c).expect(409);expect(createCount).toBe(before);const d=(await read(c).expect(200)).body.data;expect(d.refund.status).toBe('SETUP_REVIEW');expect(d.reviews[0].kind).toBe('EXTERNAL_REFUND');
});
test('fabricated refund postings without processed source proof are rejected by SQL',async()=>{
 const {c,f}=await fixture();await release(c).expect(200);const con=await pool.getConnection();try{
  await con.beginTransaction();const j=randomUUID();await con.execute("INSERT INTO wallet_journals(id,funding_id,event_type,amount_minor) VALUES(?,?,'REFUND_PROCESSED',123409)",[j,f]);
  const [[brand]]=await con.execute('SELECT id FROM wallet_accounts WHERE owner_user_id=?',[users.BRAND_ADMIN.id]);const [[clear]]=await con.query("SELECT id FROM wallet_accounts WHERE account_code='RAZORPAY_TEST_CLEARING_INR'");
  await con.execute("INSERT INTO wallet_entries(journal_id,account_id,direction,amount_minor) VALUES(?,?,'DEBIT',123409),(?,?,'CREDIT',123409)",[j,brand.id,j,clear.id]);
  await expect(con.execute("UPDATE wallet_journals SET status='POSTED',posted_at=UTC_TIMESTAMP(6) WHERE id=?",[j])).rejects.toMatchObject({sqlMessage:'WALLET_INVALID_POSTING'});
 }finally{await con.rollback();con.release();}
});
