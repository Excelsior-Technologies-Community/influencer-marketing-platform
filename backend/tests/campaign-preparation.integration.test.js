import request from 'supertest';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {pool} from '../src/config/db.js';
import {callProcedure} from '../src/repositories/procedure.repository.js';
import {hashPassword} from '../src/utils/password.js';

describe('campaign preparation with actual MySQL',()=>{
  const app=createApp({logging:false}),prefix=`prep-${randomUUID()}`,users={},tokens={},password='Preparation-test-password-2026';
  let campaign,otherCampaign,sameOwnerCampaign,platformId,categoryId,typeId,png,pdf,schedule,brief;
  const headers=(role='BRAND_ADMIN')=>({Authorization:`Bearer ${tokens[role]}`,'X-Requested-With':'InfluenceWeb'});
  const path=id=>`/api/v1/brand/campaigns/${id||campaign.id}`;
  const get=(suffix,role='BRAND_ADMIN',id)=>request(app).get(`${path(id)}/${suffix}`).set(headers(role));
  const save=(body,role='BRAND_ADMIN')=>request(app).put(`${path()}/schedule`).set(headers(role)).send(body);
  const upload=(kind='REFERENCE',bytes=png,name='original-private.png',mime='image/png',role='BRAND_ADMIN')=>request(app).post(`${path()}/files`).set(headers(role)).field('kind',kind).field('title',`Test ${kind} file`).attach('file',bytes,{filename:name,contentType:mime});
  const replace=row=>request(app).put(`${path()}/files/${row.id}`).set(headers()).field('title','Replaced private brief').field('revision',String(row.revision)).attach('file',pdf,{filename:'replacement.pdf',contentType:'application/pdf'});
  const remove=row=>request(app).delete(`${path()}/files/${row.id}`).set(headers()).send({revision:row.revision});
  const dates=()=>Object.fromEntries(['applicationsOpenAt','applicationDeadline','startAt','contentDeadline','endAt'].map((key,index)=>[key,new Date(Date.now()+(index+2)*86400000).toISOString()]));
  const content=revision=>({title:'Complete campaign preparation',description:'A clear campaign description for the creator brief.',totalBudget:'50000.50',currency:'INR',creatorSlots:3,requirements:'Original creator content and product demonstrations.',platformIds:[platformId],categoryIds:[categoryId],contentTypeIds:[typeId],deliverables:[{platformId,contentTypeId:typeId,quantity:2,description:'Original review videos'}],revision});
  beforeAll(async()=>{
    const hash=await hashPassword(password,10);
    for(const role of ['BRAND_ADMIN','OTHER_BRAND','CREATOR','SUPER_ADMIN']){const id=randomUUID(),email=`${prefix}-${role.toLowerCase()}@example.invalid`,dbRole=role==='OTHER_BRAND'?'BRAND_ADMIN':role;await callProcedure('sp_create_user',[id,dbRole,`Test ${role}`,email,hash,dbRole==='BRAND_ADMIN'?`Test ${role}`:null]);users[role]={id,email};const result=await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email,password}).expect(200);tokens[role]=result.body.data.accessToken;}
    for(const [role,target] of [['BRAND_ADMIN','campaign'],['OTHER_BRAND','other'],['BRAND_ADMIN','same']]){const result=await request(app).post('/api/v1/brand/campaigns').set(headers(role)).send({title:'Campaign preparation draft',currency:'INR'}).expect(201);if(target==='campaign')campaign=result.body.data.campaign;else if(target==='other')otherCampaign=result.body.data.campaign;else sameOwnerCampaign=result.body.data.campaign;}
    const code=()=>`P_${randomUUID().replaceAll('-','').slice(0,20)}`;
    const [platform]=await pool.execute('INSERT INTO platforms(code,name) VALUES(?,?)',[code(),`${prefix} Platform`]);platformId=platform.insertId;
    const [type]=await pool.execute('INSERT INTO content_types(code,name) VALUES(?,?)',[code(),`${prefix} Video`]);typeId=type.insertId;
    const [category]=await pool.execute('INSERT INTO categories(name) VALUES(?)',[`${prefix} Category`]);categoryId=category.insertId;
    png=await sharp({create:{width:300,height:200,channels:3,background:'#6b8451'}}).png().toBuffer();const doc=await PDFDocument.create();doc.addPage([500,300]).drawText('Synthetic campaign brief. No private user data.');pdf=Buffer.from(await doc.save());
  },20000);
  afterAll(async()=>{for(const {id} of Object.values(users)){await pool.execute('DELETE c FROM campaigns c JOIN brands b ON b.id=c.brand_id WHERE b.user_id=?',[id]);for(const table of ['email_outbox','in_app_notifications','audit_logs','refresh_sessions','password_reset_tokens','brands','creators'])await pool.execute(`DELETE FROM ${table} WHERE ${table==='audit_logs'?'actor_user_id':table==='email_outbox'||table==='in_app_notifications'?'recipient_user_id':'user_id'}=?`,[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);}if(platformId)await pool.execute('DELETE FROM platforms WHERE id=?',[platformId]);if(typeId)await pool.execute('DELETE FROM content_types WHERE id=?',[typeId]);if(categoryId)await pool.execute('DELETE FROM categories WHERE id=?',[categoryId]);await pool.end();});
  test('empty preparation is private and readiness reports saved missing fields without submission',async()=>{
    const result=await get('preparation').expect(200);expect(result.headers['cache-control']).toBe('no-store');expect(result.body.data.schedule).toMatchObject({revision:0,applicationsOpenAt:null,startAt:null});expect(result.body.data.files).toEqual([]);
    const ready=await get('readiness').expect(200);expect(ready.body.data.ready).toBe(false);expect(ready.body.data.missing.map(row=>row.key)).toEqual(expect.arrayContaining(['description','budget','requirements','platforms','categories','contentTypes','deliverables','schedule','future','brief']));expect((await request(app).get(path()).set(headers())).body.data.campaign.status).toBe('DRAFT');
  });
  test('role, owner and campaign/file association checks reject cross-account requests',async()=>{
    await request(app).get(`${path()}/preparation`).expect(401);
    for(const role of ['CREATOR','SUPER_ADMIN']){await get('preparation',role).expect(403);await get('readiness',role).expect(403);await save({revision:0},role).expect(403);await upload('BRIEF',pdf,'brief.pdf','application/pdf',role).expect(403);}
    await get('preparation','OTHER_BRAND').expect(404);await get('readiness','OTHER_BRAND').expect(404);await save({...dates(),revision:0},'OTHER_BRAND').expect(404);
    await request(app).get(`${path()}/preparation?brandId=${users.OTHER_BRAND.id}`).set(headers()).expect(422);
    await expect(callProcedure('sp_get_campaign_preparation',[users.OTHER_BRAND.id,campaign.id])).rejects.toMatchObject({sqlMessage:'CAMPAIGN_NOT_FOUND'});
  });
  test('valid schedule preserves UTC instants including offset input with independent revision',async()=>{
    const input=dates(),utc=input.applicationsOpenAt;input.applicationsOpenAt=new Date(Date.parse(utc)+330*60000).toISOString().replace('Z','+05:30');const result=await save({...input,revision:0}).expect(200);schedule=result.body.data.schedule;expect(schedule.applicationsOpenAt).toBe(utc);expect(schedule.revision).toBe(1);expect((await get('preparation')).body.data.schedule).toEqual(schedule);expect((await request(app).get(path()).set(headers())).body.data.campaign.revision).toBe(1);
  });
  test('partial, unordered, invalid calendar, ambiguous timezone and injected fields cannot change schedule',async()=>{
    for(const change of [{startAt:null},{applicationDeadline:schedule.applicationsOpenAt},{contentDeadline:schedule.startAt},{endAt:schedule.startAt},{startAt:'2026-02-30T12:00:00Z'},{startAt:'2027-01-01T12:00'},{startAt:'not-a-date'},{status:'LIVE'},{revision:'1'}])await save({...schedule,...change,updatedAt:undefined}).expect(422);
    expect((await get('preparation')).body.data.schedule).toEqual(schedule);
  });
  test('schedule concurrency, clearing, and re-saving keep revisions monotonic',async()=>{
    const body={...dates(),revision:schedule.revision},results=await Promise.all([save(body),save(body)]);expect(results.map(row=>row.status).sort()).toEqual([200,409]);schedule=results.find(row=>row.status===200).body.data.schedule;await save(body).expect(409);
    const cleared=await save({revision:schedule.revision}).expect(200);expect(cleared.body.data.schedule.startAt).toBeNull();const restored=await save({...dates(),revision:cleared.body.data.schedule.revision}).expect(200);schedule=restored.body.data.schedule;
  });
  test('private PDF brief and image reference persist with safe metadata and generated downloads',async()=>{
    const result=await upload('BRIEF',pdf,'private-brief-original.pdf','application/pdf').expect(201);brief=result.body.data.files.find(row=>row.kind==='BRIEF');expect(brief.pageCount).toBe(1);expect(JSON.stringify(result.body)).not.toMatch(/fileContent|private-brief-original|originalname/);
    const reference=await upload().expect(201);expect(reference.body.data.files.find(row=>row.kind==='REFERENCE').mimeType).toBe('image/webp');
    const binary=await get(`files/${brief.id}`).expect(200);expect(binary.headers['content-type']).toContain('application/pdf');expect(binary.headers['content-disposition']).toContain('attachment;');expect(binary.headers['content-disposition']).not.toContain('private-brief-original');expect(binary.headers['content-security-policy']).toContain('sandbox');expect(binary.headers['cache-control']).toBe('no-store');expect((await PDFDocument.load(binary.body)).getPageCount()).toBe(1);
    await get(`files/${brief.id}`,'OTHER_BRAND').expect(404);await get(`files/${brief.id}`,'BRAND_ADMIN',sameOwnerCampaign.id).expect(404);await get(`files/${brief.id}`,'BRAND_ADMIN',otherCampaign.id).expect(404);await upload('BRIEF',pdf,'brief.pdf','application/pdf').expect(409);
  });
  test('rejects spoofed/corrupt/active PDFs, oversized files, multipart abuse and unknown fields',async()=>{
    await upload('REFERENCE',png,'wrong.jpg','image/jpeg').expect(422);await upload('REFERENCE',Buffer.from('bad'),'bad.pdf','application/pdf').expect(422);await upload('REFERENCE',png,'bad.svg','image/svg+xml').expect(422);await upload('REFERENCE',Buffer.alloc(5*1024*1024+1)).expect(413);
    const active=await PDFDocument.create();active.addPage();active.addJavaScript('test','app.alert("test")');await upload('REFERENCE',Buffer.from(await active.save()),'script.pdf','application/pdf').expect(422);
    await request(app).post(`${path()}/files`).set(headers()).field('kind','REFERENCE').field('title','Test').field('ownerId',users.OTHER_BRAND.id).attach('file',png,{filename:'test.png',contentType:'image/png'}).expect(422);
    await request(app).post(`${path()}/files`).set(headers()).field('kind','REFERENCE').field('title','No file').expect(422);
    await request(app).post(`${path()}/files`).set(headers()).field('kind','REFERENCE').field('title','Two files').attach('file',png,{filename:'a.png',contentType:'image/png'}).attach('file',png,{filename:'b.png',contentType:'image/png'}).expect(422);
  });
  test('file replacement and quota races preserve revisions and limit references to five',async()=>{
    const previous=brief,results=await Promise.all([replace(brief),replace(brief)]);expect(results.map(row=>row.status).sort()).toEqual([200,409]);brief=results.find(row=>row.status===200).body.data.files.find(row=>row.kind==='BRIEF');await remove(previous).expect(409);expect(brief.revision).toBe(2);
    for(let index=0;index<3;index++)await upload().expect(201);const races=await Promise.all([upload(),upload()]);expect(races.map(row=>row.status).sort()).toEqual([201,409]);expect((await get('preparation')).body.data.files.filter(row=>row.kind==='REFERENCE')).toHaveLength(5);
  });
  test('required content, brief, future deadlines and active choices determine readiness without changing state',async()=>{
    const saved=await request(app).put(path()).set(headers()).send(content(1)).expect(200);campaign=saved.body.data.campaign;expect((await get('readiness')).body.data.ready).toBe(true);expect((await get('preparation')).body.data.schedule.revision).toBe(schedule.revision);expect((await get('preparation')).body.data.files).toHaveLength(6);
    try{await pool.execute('UPDATE platforms SET is_active=FALSE WHERE id=?',[platformId]);const result=await get('readiness').expect(200);expect(result.body.data.ready).toBe(false);expect(result.body.data.missing.some(row=>row.key==='platforms')).toBe(true);}finally{await pool.execute('UPDATE platforms SET is_active=TRUE WHERE id=?',[platformId]);}
    const past=Object.fromEntries(Object.entries(dates()).map(([key,value])=>[key,new Date(Date.parse(value)-30*86400000).toISOString()]));schedule=(await save({...past,revision:schedule.revision}).expect(200)).body.data.schedule;expect((await get('readiness')).body.data.missing.some(row=>row.key==='future')).toBe(true);schedule=(await save({...dates(),revision:schedule.revision}).expect(200)).body.data.schedule;expect((await get('readiness')).body.data.ready).toBe(true);expect((await request(app).get(path()).set(headers())).body.data.campaign.status).toBe('DRAFT');
  });
  test('non-draft state, origin protection and suspension block all preparation mutations',async()=>{
    try{await pool.execute("UPDATE campaigns SET status='APPROVED' WHERE id=?",[campaign.id]);await save({...dates(),revision:schedule.revision}).expect(409);await replace(brief).expect(409);await remove(brief).expect(409);await upload().expect(409);await get(`files/${brief.id}`).expect(200);}finally{await pool.execute("UPDATE campaigns SET status='DRAFT' WHERE id=?",[campaign.id]);}
    await save({...dates(),revision:schedule.revision}).set('Origin','https://foreign.example').expect(403);await request(app).put(`${path()}/schedule`).set('Authorization',`Bearer ${tokens.BRAND_ADMIN}`).send({revision:schedule.revision}).expect(403);
    try{await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[users.BRAND_ADMIN.id]);await get('preparation').expect(401);await get(`files/${brief.id}`).expect(401);await expect(callProcedure('sp_get_campaign_preparation',[users.BRAND_ADMIN.id,campaign.id])).rejects.toMatchObject({sqlMessage:'BRAND_FORBIDDEN'});}finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.BRAND_ADMIN.id]);}
  });
  test('removal invalidates old file IDs, readiness reacts, and audit data excludes titles/bytes/schedules',async()=>{
    await remove(brief).expect(200);await get(`files/${brief.id}`).expect(404);expect((await get('readiness')).body.data.missing.some(row=>row.key==='brief')).toBe(true);const created=await upload('BRIEF',pdf,'fresh.pdf','application/pdf').expect(201),fresh=created.body.data.files.find(row=>row.kind==='BRIEF');expect(fresh.id).not.toBe(brief.id);await remove(brief).expect(404);await get(`files/${fresh.id}`).expect(200);
    const [logs]=await pool.execute('SELECT action,metadata FROM audit_logs WHERE actor_user_id=?',[users.BRAND_ADMIN.id]);expect(logs.map(row=>row.action)).toEqual(expect.arrayContaining(['CAMPAIGN_SCHEDULE_SAVED','CAMPAIGN_FILE_ADDED','CAMPAIGN_FILE_REPLACED','CAMPAIGN_FILE_REMOVED']));expect(JSON.stringify(logs)).not.toMatch(/original-private|private-brief-original|Replaced private brief|fileContent|applicationsOpenAt/);
  });
});
