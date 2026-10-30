import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../src/utils/password.js';
import {createIsolatedDatabase} from './helpers/isolated-database.js';
const isolated=await createIsolatedDatabase();
const {createApp}=await import('../src/app.js');
const {pool}=await import('../src/config/db.js');
const {callProcedure}=await import('../src/repositories/procedure.repository.js');
const app=createApp({logging:false}),users={},tokens={};let platform,type;
const headers=(role='BRAND_ADMIN')=>({Authorization:`Bearer ${tokens[role]}`,'X-Requested-With':'InfluenceWeb'});
const path=c=>`/api/v1/brand/campaigns/${c}/earnings-release`;
const read=(c,role='BRAND_ADMIN')=>request(app).get(path(c)).set(headers(role));
const release=(c,extra={},role='BRAND_ADMIN')=>request(app).post(path(c)).set(headers(role)).send({revision:1,...extra});
const wallet=(role='BRAND_ADMIN')=>request(app).get(`/api/v1/${role.includes('BRAND')?'brand':'creator'}/wallet`).set(headers(role));
// Deterministic completion/capture fixtures in a disposable schema. No external charges.
async function fixture({amount=123409,count=2,status='COMPLETED',capture=true,approved=true}={}){
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
 return {c,f,order,pay,amount};
}
beforeAll(async()=>{
 const hash=await hashPassword('Release-test-password-2026',10);
 for(const role of ['BRAND_ADMIN','OTHER_BRAND','CREATOR','OTHER_CREATOR','SUPER_ADMIN']){const id=randomUUID(),email=`release-${id}@example.invalid`,dbRole=role==='OTHER_BRAND'?'BRAND_ADMIN':role==='OTHER_CREATOR'?'CREATOR':role;await callProcedure('sp_create_user',[id,dbRole,`Release ${role}`,email,hash,dbRole==='BRAND_ADMIN'?'Release test Brand':null]);users[role]={id,email};const r=await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email,password:'Release-test-password-2026'}).expect(200);tokens[role]=r.body.data.accessToken;}
 [[{id:platform}]]=await pool.query('SELECT id FROM platforms ORDER BY id LIMIT 1');[[{id:type}]]=await pool.query('SELECT id FROM content_types ORDER BY id LIMIT 1');
},20000);
afterAll(async()=>{await pool.end();await isolated.drop();});
test('equal split, allocation-order remainder, per-share commission and exact ledger balance',async()=>{
 const {c,f}=await fixture(),p=(await read(c).expect(200)).body.data;
 expect(p.release).toMatchObject({canRelease:true,released:false,commissionBps:1000});expect(p.items.map(x=>[x.grossMinor,x.commissionMinor,x.netMinor])).toEqual([['61705','6170','55535'],['61704','6170','55534']]);
 await release(c).expect(200);const r=(await read(c).expect(200)).body.data;expect(r.release).toMatchObject({released:true,canRelease:false});expect(r.items).toEqual(p.items);
 const [rows]=await pool.execute("SELECT e.direction,a.account_type,CAST(e.amount_minor AS CHAR) AS amount FROM wallet_entries e JOIN wallet_journals j ON j.id=e.journal_id JOIN wallet_accounts a ON a.id=e.account_id WHERE j.funding_id=? AND j.event_type='CREATOR_RELEASE'",[f]);
 expect(rows).toHaveLength(4);expect(rows.find(x=>x.account_type==='PLATFORM_COMMISSION').amount).toBe('12340');expect(rows.reduce((s,x)=>s+(x.direction==='CREDIT'?1n:-1n)*BigInt(x.amount),0n)).toBe(0n);
 const h=await request(app).get('/api/v1/creator/wallet/transactions').query({campaignId:c}).set(headers('CREATOR')).expect(200);expect(h.body.data.items).toHaveLength(1);expect(h.body.data.items[0]).toMatchObject({eventType:'CREATOR_RELEASE',amountMinor:'55535',grossMinor:'61705',commissionMinor:'6170'});
});
test('concurrent retries and capture replays never duplicate credits or commission',async()=>{
 const x=await fixture();await Promise.all([release(x.c).expect(200),release(x.c).expect(200),release(x.c).expect(200)]);
 await callProcedure('sp_funding_record_payment',[x.f,x.order,x.pay,'CAPTURED',x.amount,'INR',null,null,'CHECKOUT',randomUUID()]);
 await pool.query('CALL sp_wallet_backfill_funding()');const [[n]]=await pool.execute('SELECT COUNT(*) AS n FROM wallet_journals WHERE funding_id=?',[x.f]);expect(n.n).toBe(2);
 const [[a]]=await pool.execute("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id=? AND action='CREATOR_EARNINGS_RELEASED'",[x.c]);expect(a.n).toBe(1);
});
test('incomplete/cancelled campaigns, missing latest reviews and uncaptured funds block release',async()=>{
 for(const options of [{status:'IN_PROGRESS'},{status:'CANCELLED'},{approved:false},{capture:false}]){const {c}=await fixture(options);expect((await read(c).expect(200)).body.data.release.canRelease).toBe(false);await release(c).expect(409);}
 const {c}=await fixture();await pool.execute('UPDATE content_submissions SET version=2 WHERE campaign_id=?',[c]);await release(c).expect(409);
});
test('owner, role, stale revision, strict body and browser origin are enforced',async()=>{
 const {c}=await fixture();await read(c,'OTHER_BRAND').expect(404);await release(c,{},'OTHER_BRAND').expect(404);await release(c,{},'CREATOR').expect(403);await release(c,{},'SUPER_ADMIN').expect(403);await release(c,{revision:0}).expect(409);for(const extra of [{revision:'1'},{amountMinor:1},{commissionBps:0},{userId:users.CREATOR.id}])await release(c,extra).expect(422);await release(c).set('Origin','https://foreign.example').expect(403);await request(app).post(path(c)).set('Authorization',`Bearer ${tokens.BRAND_ADMIN}`).send({revision:1}).expect(403);await read(randomUUID()).expect(404);
});
test('inactive Creator blocks entire release; active Creator can receive after reactivation',async()=>{
 const {c}=await fixture();await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[users.OTHER_CREATOR.id]);try{expect((await read(c).expect(200)).body.data.release.canRelease).toBe(false);await release(c).expect(409);}finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.OTHER_CREATOR.id]);}await release(c).expect(200);
});
test('ledger fault rolls back every earnings record and debit; retry succeeds',async()=>{
 const {c,f}=await fixture(),before=(await wallet().expect(200)).body.data.wallet;
 await pool.query(`CREATE TRIGGER synthetic_release_fault BEFORE INSERT ON wallet_entries FOR EACH ROW BEGIN IF EXISTS(SELECT 1 FROM wallet_journals WHERE id=NEW.journal_id AND funding_id='${f}' AND event_type='CREATOR_RELEASE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WALLET_INVALID_POSTING';END IF;END`);
 try{await release(c).expect(409);}finally{await pool.query('DROP TRIGGER synthetic_release_fault');}
 expect((await wallet().expect(200)).body.data.wallet).toEqual(before);const [[n]]=await pool.execute("SELECT COUNT(*) AS n FROM wallet_journals WHERE funding_id=? AND event_type='CREATOR_RELEASE'",[f]);expect(n.n).toBe(0);expect((await read(c).expect(200)).body.data.release.canRelease).toBe(true);await release(c).expect(200);
});
test('release snapshots, posted entries and journals remain immutable',async()=>{
 const {c}=await fixture();const j=(await release(c).expect(200)).body.data.release.journalId;
 for(const sql of ['UPDATE creator_payment_releases SET net_minor=1 WHERE journal_id=?','DELETE FROM creator_payment_releases WHERE journal_id=?','DELETE FROM wallet_entries WHERE journal_id=?'])await expect(pool.execute(sql,[j])).rejects.toMatchObject({sqlMessage:'WALLET_IMMUTABLE'});
 await expect(pool.execute('DELETE FROM wallet_journals WHERE id=?',[j])).rejects.toMatchObject({sqlMessage:'WALLET_IMMUTABLE'});
 const r=(await read(c).expect(200));expect(r.headers['cache-control']).toBe('no-store');
});
test('one-paise fee and large budget preserve exact integer arithmetic',async()=>{
 for(const amount of [101,99999999999]){const {c}=await fixture({amount});const p=(await read(c).expect(200)).body.data;expect(p.items.reduce((s,x)=>s+BigInt(x.grossMinor),0n)).toBe(BigInt(amount));for(const x of p.items){expect(BigInt(x.commissionMinor)).toBe(BigInt(x.grossMinor)/10n);expect(BigInt(x.netMinor)+BigInt(x.commissionMinor)).toBe(BigInt(x.grossMinor));}await release(c).expect(200);}
});
