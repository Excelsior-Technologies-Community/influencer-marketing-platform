import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { callProcedure } from '../src/repositories/procedure.repository.js';
import { hashPassword } from '../src/utils/password.js';

describe('Module 5 Task 2 social accounts with real MySQL',()=>{
  const app=createApp({logging:false}),prefix=`social-${randomUUID()}`,password='Social-tests-password-2026',users={},tokens={};
  let platformId,inactiveId,instagramId,account;
  const headers=role=>({Authorization:`Bearer ${tokens[role]}`,'X-Requested-With':'InfluenceWeb'});
  const list=(role='CREATOR')=>request(app).get('/api/v1/creator/social-accounts').set(headers(role));
  const add=(body,role='CREATOR')=>request(app).post('/api/v1/creator/social-accounts').set(headers(role)).send(body);
  const update=(id,body,role='CREATOR')=>request(app).put(`/api/v1/creator/social-accounts/${id}`).set(headers(role)).send(body);
  const remove=(id,revision,role='CREATOR')=>request(app).delete(`/api/v1/creator/social-accounts/${id}`).set(headers(role)).send({revision});
  const editable=row=>({username:row.username,profileUrl:row.profileUrl,followersCount:row.followersCount,averageViews:row.averageViews,engagementRate:row.engagementRate,revision:row.revision});
  const body=()=>({platformId,username:'@creator.demo',profileUrl:'https://social.example.com/creator.demo',followersCount:12000,averageViews:3500,engagementRate:4.25});
  beforeAll(async()=>{
    const hash=await hashPassword(password,10);
    for(const role of ['CREATOR','OTHER','BRAND_ADMIN','SUPER_ADMIN']){
      const id=randomUUID(),email=`${prefix}-${role.toLowerCase()}@example.invalid`;
      await callProcedure('sp_create_user',[id,role==='OTHER'?'CREATOR':role,`Test ${role}`,email,hash,role==='BRAND_ADMIN'?'Test Brand':null]);users[role]={id,email};
      const response=await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email,password}).expect(200);tokens[role]=response.body.data.accessToken;
    }
    const [platform]=await pool.execute('INSERT INTO platforms(code,name) VALUES(?,?)',[`T_${randomUUID().replaceAll('-','').slice(0,20)}`,`${prefix} Active`]);platformId=platform.insertId;
    const [inactive]=await pool.execute('INSERT INTO platforms(code,name,is_active) VALUES(?,?,FALSE)',[`T_${randomUUID().replaceAll('-','').slice(0,20)}`,`${prefix} Inactive`]);inactiveId=inactive.insertId;
    const [[instagram]]=await pool.execute("SELECT id FROM platforms WHERE code='INSTAGRAM'");instagramId=instagram.id;
  },20000);
  afterAll(async()=>{
    for(const {id} of Object.values(users)){for(const table of ['email_outbox','in_app_notifications','audit_logs','refresh_sessions','password_reset_tokens','creators','brands'])await pool.execute(`DELETE FROM ${table} WHERE ${table==='audit_logs'?'actor_user_id':table==='email_outbox'||table==='in_app_notifications'?'recipient_user_id':'user_id'}=?`,[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);}
    for(const id of [platformId,inactiveId])if(id)await pool.execute('DELETE FROM platforms WHERE id=?',[id]);await pool.end();
  });
  test('empty own list includes active platform choices and is private',async()=>{
    const response=await list().expect(200);expect(response.body.data.items).toEqual([]);expect(response.headers['cache-control']).toBe('no-store');expect(response.body.data.platforms.some(row=>row.id===platformId&&row.isAvailable)).toBe(true);expect(response.body.data.platforms.some(row=>row.id===inactiveId)).toBe(false);
  });
  test('requires an active Creator for every route',async()=>{
    await request(app).get('/api/v1/creator/social-accounts').expect(401);
    for(const role of ['BRAND_ADMIN','SUPER_ADMIN']){await list(role).expect(403);await add(body(),role).expect(403);await update(randomUUID(),{revision:1},role).expect(403);await remove(randomUUID(),1,role).expect(403);}
  });
  test('creates normalized account and persistent manual metrics without verification claims',async()=>{
    const response=await add(body()).expect(201);account=response.body.data.items[0];expect(account.username).toBe('creator.demo');expect(account.metricsSource).toBe('MANUAL');expect(account.isVerified).toBe(false);expect(account.followersCount).toBe(12000);expect(account.engagementRate).toBe(4.25);expect(account.metricsReportedAt).toBeTruthy();expect(account.revision).toBe(1);
    const loaded=await list().expect(200);expect(loaded.body.data.items).toEqual(response.body.data.items);expect(JSON.stringify(loaded.body)).not.toMatch(/accessToken|refreshToken|password|token_hash/);
    const profile=await request(app).get('/api/v1/creator/profile').set(headers('CREATOR')).expect(200);expect(profile.body.data.profile.revision).toBe(0);expect(profile.body.data.profile.verificationStatus).toBe('PENDING');
  });
  test('unique platform rule holds under simultaneous creation',async()=>{
    const results=await Promise.all([add(body(),'OTHER'),add(body(),'OTHER')]);expect(results.map(row=>row.status).sort()).toEqual([201,409]);await add(body()).expect(409);
  });
  test('foreign account IDs cannot be read-selected, edited or deleted',async()=>{
    await list('OTHER').expect(200);await request(app).get(`/api/v1/creator/social-accounts?creatorId=${users.CREATOR.id}`).set(headers('OTHER')).expect(422);
    await update(account.id,{...editable(account),username:'stolen'},'OTHER').expect(404);await remove(account.id,1,'OTHER').expect(404);
    await expect(callProcedure('sp_delete_creator_social_account',[users.OTHER.id,account.id,1,randomUUID()])).rejects.toMatchObject({sqlMessage:'SOCIAL_NOT_FOUND'});
  });
  test('rejects credential fields, identity injection, invalid URLs and unsafe or out-of-range metrics',async()=>{
    for(const change of [{accessToken:'secret'},{metricsSource:'VERIFIED'},{isVerified:true},{creatorId:users.OTHER.id},{username:'invalid handle'},{profileUrl:'javascript:alert(1)'},{profileUrl:'http://social.example.com/user'},{profileUrl:'https://user:secret@social.example.com/user'},{profileUrl:'https://127.0.0.1/user'},{profileUrl:'https://foo.local/user'},{followersCount:-1},{followersCount:1.2},{followersCount:1000000000001},{followersCount:'12000'},{engagementRate:100.1},{engagementRate:1.234}])await add({...body(),...change}).expect(422);
    await update('invalid-id',editable(account)).expect(422);await update(account.id,{...editable(account),platformId:inactiveId}).expect(422);
    await add({...body(),platformId:2147483647}).expect(422);await add({...body(),platformId:inactiveId}).expect(422);
    await add({...body(),platformId:instagramId,profileUrl:'https://instagram.com.evil.example/user'}).expect(422);
  });
  test('updates metrics, treats zero as known and blanks as unknown',async()=>{
    const response=await update(account.id,{...editable(account),followersCount:0,averageViews:null,engagementRate:0}).expect(200);account=response.body.data.items[0];expect(account.followersCount).toBe(0);expect(account.averageViews).toBeNull();expect(account.engagementRate).toBe(0);expect(account.revision).toBe(2);
    const cleared=await update(account.id,{...editable(account),followersCount:null,averageViews:null,engagementRate:null}).expect(200);account=cleared.body.data.items[0];expect(account.metricsReportedAt).toBeNull();
  });
  test('concurrent updates and stale removal cannot overwrite a newer revision',async()=>{
    const input=editable(account),responses=await Promise.all([update(account.id,{...input,username:'first'}),update(account.id,{...input,username:'second'})]);expect(responses.map(row=>row.status).sort()).toEqual([200,409]);account=responses.find(row=>row.status===200).body.data.items[0];await update(account.id,input).expect(409);await remove(account.id,input.revision).expect(409);
  });
  test('an inactive existing platform can be edited or removed but not newly selected',async()=>{
    await pool.execute('UPDATE platforms SET is_active=FALSE WHERE id=?',[platformId]);
    try{const response=await list().expect(200);expect(response.body.data.items[0].isAvailable).toBe(false);expect(response.body.data.platforms.some(row=>row.id===platformId&&!row.isAvailable)).toBe(true);
      const changed=await update(account.id,{...editable(account),username:'historical.handle'}).expect(200);account=changed.body.data.items[0];await remove(account.id,account.revision).expect(200);await add(body()).expect(422);
    }finally{await pool.execute('UPDATE platforms SET is_active=TRUE WHERE id=?',[platformId]);}
  });
  test('mutation protection and direct procedure role/suspension checks remain enforced',async()=>{
    await request(app).post('/api/v1/creator/social-accounts').set('Authorization',`Bearer ${tokens.CREATOR}`).send(body()).expect(403);await add(body()).set('Origin','https://foreign.example').expect(403);
    await expect(callProcedure('sp_save_creator_social_account',[users.BRAND_ADMIN.id,randomUUID(),true,platformId,'denied','https://social.example.com/user',null,null,null,null,randomUUID()])).rejects.toMatchObject({sqlMessage:'CREATOR_FORBIDDEN'});
    try{await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[users.CREATOR.id]);await list().expect(401);await add(body()).expect(401);await expect(callProcedure('sp_get_creator_social_accounts',[users.CREATOR.id])).rejects.toMatchObject({sqlMessage:'CREATOR_FORBIDDEN'});}
    finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.CREATOR.id]);}
  });
  test('remove is owned, revision checked and audited without private values',async()=>{
    const created=await add(body()).expect(201),row=created.body.data.items[0];await remove(row.id,row.revision).expect(200);await remove(row.id,row.revision).expect(404);expect((await list()).body.data.items).toEqual([]);
    const [logs]=await pool.execute("SELECT action,metadata FROM audit_logs WHERE actor_user_id=? AND entity_type='creator_social_accounts'",[users.CREATOR.id]);expect(logs.map(row=>row.action)).toEqual(expect.arrayContaining(['CREATOR_SOCIAL_ADDED','CREATOR_SOCIAL_UPDATED','CREATOR_SOCIAL_REMOVED']));expect(JSON.stringify(logs)).not.toMatch(/creator.demo|social.example|followersCount|accessToken/);
  });
});
