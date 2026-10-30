import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {pool} from '../src/config/db.js';
import {callProcedure} from '../src/repositories/procedure.repository.js';
import {hashPassword} from '../src/utils/password.js';

describe('Module 6 Task 1 campaign draft creation/editing with MySQL',()=>{
  const app=createApp({logging:false}),prefix=`c6-${randomUUID()}`,users={},tokens={},password='Campaign-tests-password-2026';
  let platformId,typeId,categoryId,inactiveId,campaign;
  const headers=(role='BRAND_ADMIN')=>({Authorization:`Bearer ${tokens[role]}`,'X-Requested-With':'InfluenceWeb'});
  const create=(body,role='BRAND_ADMIN')=>request(app).post('/api/v1/brand/campaigns').set(headers(role)).send(body);
  const get=(id,role='BRAND_ADMIN')=>request(app).get(`/api/v1/brand/campaigns/${id}`).set(headers(role));
  const update=(body,role='BRAND_ADMIN',id=campaign.id)=>request(app).put(`/api/v1/brand/campaigns/${id}`).set(headers(role)).send(body);
  const listing=(query='',role='BRAND_ADMIN')=>request(app).get(`/api/v1/brand/campaigns${query}`).set(headers(role));
  const input=()=>({title:'Summer lifestyle creator campaign',description:'Create useful lifestyle content for our summer launch.',totalBudget:'123456789.09',currency:'INR',creatorSlots:4,requirements:'Original content and clear product demonstrations.',platformIds:[platformId],categoryIds:[categoryId],contentTypeIds:[typeId],deliverables:[{platformId,contentTypeId:typeId,quantity:2,description:'Two short review videos per creator'}]});
  const writable=row=>({...Object.fromEntries(['title','description','totalBudget','currency','creatorSlots','requirements','platformIds','categoryIds','contentTypeIds','revision'].map(key=>[key,row[key]])),deliverables:row.deliverables.map(({platformId,contentTypeId,quantity,description})=>({platformId,contentTypeId,quantity,description}))});
  beforeAll(async()=>{
    const hash=await hashPassword(password,10);
    for(const role of ['BRAND_ADMIN','OTHER_BRAND','CREATOR','SUPER_ADMIN']){const id=randomUUID(),email=`${prefix}-${role.toLowerCase()}@example.invalid`,dbRole=role==='OTHER_BRAND'?'BRAND_ADMIN':role;await callProcedure('sp_create_user',[id,dbRole,`Test ${role}`,email,hash,dbRole==='BRAND_ADMIN'?`Test company ${role}`:null]);users[role]={id,email};const response=await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email,password}).expect(200);tokens[role]=response.body.data.accessToken;}
    const code=()=>`C_${randomUUID().replaceAll('-','').slice(0,20)}`;
    const [platform]=await pool.execute('INSERT INTO platforms(code,name) VALUES(?,?)',[code(),`${prefix} Platform`]);platformId=platform.insertId;
    const [type]=await pool.execute('INSERT INTO content_types(code,name) VALUES(?,?)',[code(),`${prefix} Video`]);typeId=type.insertId;
    const [category]=await pool.execute('INSERT INTO categories(name) VALUES(?)',[`${prefix} Category`]);categoryId=category.insertId;
    const [inactive]=await pool.execute('INSERT INTO categories(name,is_active) VALUES(?,FALSE)',[`${prefix} Inactive`]);inactiveId=inactive.insertId;
  },20000);
  afterAll(async()=>{for(const {id} of Object.values(users)){await pool.execute('DELETE c FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE b.user_id=?',[id]);for(const table of ['email_outbox','in_app_notifications','audit_logs','refresh_sessions','password_reset_tokens','brands','creators'])await pool.execute(`DELETE FROM ${table} WHERE ${table==='audit_logs'?'actor_user_id':table==='email_outbox'||table==='in_app_notifications'?'recipient_user_id':'user_id'}=?`,[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);}if(platformId)await pool.execute('DELETE FROM platforms WHERE id=?',[platformId]);if(typeId)await pool.execute('DELETE FROM content_types WHERE id=?',[typeId]);for(const id of [categoryId,inactiveId])if(id)await pool.execute('DELETE FROM categories WHERE id=?',[id]);await pool.end();});
  test('role-protected private draft list and active catalog choices',async()=>{
    const response=await listing().expect(200);expect(response.body.data.items).toEqual([]);expect(response.headers['cache-control']).toBe('no-store');expect(response.body.meta.total).toBe(0);
    await request(app).get('/api/v1/brand/campaigns').expect(401);
    for(const role of ['CREATOR','SUPER_ADMIN']){await listing('',role).expect(403);await create(input(),role).expect(403);await get(randomUUID(),role).expect(403);}
    const choices=await request(app).get('/api/v1/brand/campaigns/catalogs').set(headers()).expect(200);expect(choices.body.data.platforms.some(row=>row.id===platformId&&row.isAvailable)).toBe(true);expect(choices.body.data.categories.some(row=>row.id===inactiveId)).toBe(false);
  });
  test('creates a draft and persists exact decimal budget, choices and deliverables',async()=>{
    const response=await create(input()).expect(201);campaign=response.body.data.campaign;expect(campaign.status).toBe('DRAFT');expect(campaign.revision).toBe(1);expect(campaign.totalBudget).toBe('123456789.09');expect(typeof campaign.totalBudget).toBe('string');expect(campaign.creatorSlots).toBe(4);expect(campaign.deliverables[0]).toMatchObject({platformId,contentTypeId:typeId,quantity:2,description:'Two short review videos per creator'});expect(campaign.platformIds).toEqual([platformId]);expect(campaign.categoryIds).toEqual([categoryId]);expect((await get(campaign.id)).body.data.campaign).toEqual(campaign);
    expect(JSON.stringify(campaign)).not.toMatch(/password_hash|token_hash|brand_id|userId/);
  });
  test('second Brand cannot discover, select, read or edit owned drafts',async()=>{
    expect((await listing('','OTHER_BRAND')).body.data.items).toEqual([]);await get(campaign.id,'OTHER_BRAND').expect(404);await update(writable(campaign),'OTHER_BRAND').expect(404);
    await request(app).get(`/api/v1/brand/campaigns/catalogs?campaignId=${campaign.id}`).set(headers('OTHER_BRAND')).expect(404);
    await listing(`?brandId=${users.BRAND_ADMIN.id}`).expect(422);await create({...input(),brandId:users.OTHER_BRAND.id}).expect(422);
    await expect(callProcedure('sp_get_campaign',[users.OTHER_BRAND.id,campaign.id])).rejects.toMatchObject({sqlMessage:'CAMPAIGN_NOT_FOUND'});
  });
  test('partial drafts require title/currency but allow blank optional planning fields',async()=>{
    const response=await create({title:'Early planning draft',currency:'USD'}).expect(201),row=response.body.data.campaign;expect(row.totalBudget).toBeNull();expect(row.description).toBeNull();expect(row.creatorSlots).toBe(1);expect(row.deliverables).toEqual([]);
    const saved=await update({title:'Renamed planning draft',currency:'EUR',revision:1},'BRAND_ADMIN',row.id).expect(200);expect(saved.body.data.campaign.revision).toBe(2);expect(saved.body.data.campaign.currency).toBe('EUR');
    const page=await listing('?pageSize=1&page=2').expect(200);expect(page.body.data.items).toHaveLength(1);expect(page.body.meta.total).toBe(2);expect((await listing('?pageSize=1&page=99')).body.meta.total).toBe(2);
  });
  test('validates privilege injection, budget/slot bounds, duplicates and deliverable coherence',async()=>{
    for(const change of [{status:'LIVE'},{revision:99},{id:randomUUID()},{title:'x'},{currency:'XXX'},{totalBudget:100},{totalBudget:'0.00'},{totalBudget:'-1'},{totalBudget:'1e3'},{totalBudget:'01.00'},{totalBudget:'1.001'},{totalBudget:'1000000000.00'},{creatorSlots:0},{creatorSlots:10001},{creatorSlots:'4'},{description:'x'.repeat(5001)},{requirements:'x'.repeat(3001)},{platformIds:[platformId,platformId]},{categoryIds:['1']},{deliverables:[{platformId,contentTypeId:typeId,quantity:0}]},{deliverables:[{platformId,contentTypeId:typeId,quantity:1,unknown:'extra'}]},{platformIds:[],deliverables:input().deliverables},{deliverables:[input().deliverables[0],input().deliverables[0]]}])await create({...input(),...change}).expect(422);
    await create({title:'Currency required'}).expect(422);await listing('?pageSize=51').expect(422);await get('invalid-id').expect(422);
  });
  test('invalid or unavailable catalog IDs roll back all fields, links and revisions',async()=>{
    for(const change of [{categoryIds:[2147483647]},{categoryIds:[inactiveId]},{platformIds:[2147483647],deliverables:[]},{contentTypeIds:[2147483647],deliverables:[]}])await update({...writable(campaign),title:'Must not persist',...change}).expect(422);
    expect((await get(campaign.id)).body.data.campaign).toEqual(campaign);
  });
  test('updates all editable fields and clears selected collections atomically',async()=>{
    const response=await update({...writable(campaign),title:'Updated campaign brief',totalBudget:'0.01',currency:'GBP',creatorSlots:2,description:null,requirements:null,deliverables:[],platformIds:[],contentTypeIds:[]}).expect(200);campaign=response.body.data.campaign;expect(campaign.totalBudget).toBe('0.01');expect(campaign.currency).toBe('GBP');expect(campaign.description).toBeNull();expect(campaign.deliverables).toEqual([]);expect(campaign.platformIds).toEqual([]);expect(campaign.categoryIds).toEqual([categoryId]);
    const restored=await update({...input(),revision:campaign.revision}).expect(200);campaign=restored.body.data.campaign;
  });
  test('simultaneous/stale edits cannot overwrite a newer draft',async()=>{
    const body=writable(campaign),responses=await Promise.all([update({...body,title:'Concurrent draft A'}),update({...body,title:'Concurrent draft B'})]);expect(responses.map(row=>row.status).sort()).toEqual([200,409]);campaign=responses.find(row=>row.status===200).body.data.campaign;await update(body).expect(409);expect((await get(campaign.id)).body.data.campaign.title).toBe(campaign.title);
  });
  test('retains unavailable historical choices while preventing new selections and non-draft edits',async()=>{
    try{await pool.execute('UPDATE platforms SET is_active=FALSE WHERE id=?',[platformId]);await pool.execute('UPDATE categories SET is_active=FALSE WHERE id=?',[categoryId]);await pool.execute('UPDATE content_types SET is_active=FALSE WHERE id=?',[typeId]);
      const saved=await update({...writable(campaign),title:'Retained historical choices'}).expect(200);campaign=saved.body.data.campaign;expect(campaign.platforms[0].isAvailable).toBe(false);expect(campaign.categories[0].isAvailable).toBe(false);expect(campaign.contentTypes[0].isAvailable).toBe(false);await create(input()).expect(422);
      const choices=await request(app).get(`/api/v1/brand/campaigns/catalogs?campaignId=${campaign.id}`).set(headers()).expect(200);expect(choices.body.data.platforms.some(row=>row.id===platformId&&!row.isAvailable)).toBe(true);
      await pool.execute("UPDATE campaigns SET status='APPROVED' WHERE id=?",[campaign.id]);await update(writable(campaign)).expect(409);
    }finally{await pool.execute('UPDATE platforms SET is_active=TRUE WHERE id=?',[platformId]);await pool.execute('UPDATE categories SET is_active=TRUE WHERE id=?',[categoryId]);await pool.execute('UPDATE content_types SET is_active=TRUE WHERE id=?',[typeId]);await pool.execute("UPDATE campaigns SET status='DRAFT' WHERE id=?",[campaign.id]);}
  });
  test('mutation protection, suspension and direct procedure role checks remain enforced',async()=>{
    await create(input()).set('Origin','https://foreign.example').expect(403);await request(app).post('/api/v1/brand/campaigns').set('Authorization',`Bearer ${tokens.BRAND_ADMIN}`).send(input()).expect(403);
    await expect(callProcedure('sp_get_campaign',[users.CREATOR.id,campaign.id])).rejects.toMatchObject({sqlMessage:'BRAND_FORBIDDEN'});
    try{await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[users.BRAND_ADMIN.id]);await listing().expect(401);await update(writable(campaign)).expect(401);await expect(callProcedure('sp_get_campaigns',[users.BRAND_ADMIN.id,10,0])).rejects.toMatchObject({sqlMessage:'BRAND_FORBIDDEN'});}
    finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.BRAND_ADMIN.id]);}
  });
  test('draft changes leave safe audit history without brief/budget text or status changes',async()=>{
    const [rows]=await pool.execute("SELECT action,metadata FROM audit_logs WHERE actor_user_id=? AND entity_type='campaigns'",[users.BRAND_ADMIN.id]);expect(rows.map(row=>row.action)).toEqual(expect.arrayContaining(['CAMPAIGN_DRAFT_CREATED','CAMPAIGN_DRAFT_UPDATED']));expect(JSON.stringify(rows)).not.toMatch(/Original content|123456789|Summer lifestyle|password|token/);expect((await get(campaign.id)).body.data.campaign.status).toBe('DRAFT');
  });
});
