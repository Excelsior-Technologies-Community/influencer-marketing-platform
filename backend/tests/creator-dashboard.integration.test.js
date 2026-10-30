import request from 'supertest';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { callProcedure } from '../src/repositories/procedure.repository.js';
import { hashPassword } from '../src/utils/password.js';

describe('Module 5 Task 4 dashboard and combined workflow with MySQL',()=>{
  const app=createApp({logging:false}),prefix=`dashboard-${randomUUID()}`,users={},tokens={},password='Dashboard-tests-password-2026';
  let categoryId,platformId,otherPlatformId,creatorId,png;
  const headers=(role='CREATOR')=>({Authorization:`Bearer ${tokens[role]}`,'X-Requested-With':'InfluenceWeb'});
  const dashboard=(role='CREATOR')=>request(app).get('/api/v1/creator/dashboard').set(headers(role));
  const saveProfile=body=>request(app).put('/api/v1/creator/profile').set(headers()).send(body);
  const addSocial=body=>request(app).post('/api/v1/creator/social-accounts').set(headers()).send(body);
  const upload=kind=>request(app).post('/api/v1/creator/media').set(headers()).field('kind',kind).field('title',`Test ${kind} file`).attach('file',png,{filename:'private-fixture.png',contentType:'image/png'});
  beforeAll(async()=>{
    const hash=await hashPassword(password,10);
    for(const role of ['CREATOR','OTHER','BRAND_ADMIN','SUPER_ADMIN']){const id=randomUUID(),email=`${prefix}-${role.toLowerCase()}@example.invalid`;await callProcedure('sp_create_user',[id,role==='OTHER'?'CREATOR':role,`Test ${role}`,email,hash,role==='BRAND_ADMIN'?'Test Brand':null]);users[role]={id,email};const response=await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email,password}).expect(200);tokens[role]=response.body.data.accessToken;}
    const [[creator]]=await pool.execute('SELECT id FROM creators WHERE user_id=?',[users.CREATOR.id]);creatorId=creator.id;
    const [category]=await pool.execute('INSERT INTO categories(name) VALUES(?)',[`${prefix} Category`]);categoryId=category.insertId;
    const [platform]=await pool.execute('INSERT INTO platforms(code,name) VALUES(?,?)',[`D_${randomUUID().replaceAll('-','').slice(0,20)}`,`${prefix} Platform`]);platformId=platform.insertId;
    const [other]=await pool.execute('INSERT INTO platforms(code,name) VALUES(?,?)',[`D_${randomUUID().replaceAll('-','').slice(0,20)}`,`${prefix.slice(0,32)} Other platform`]);otherPlatformId=other.insertId;
    png=await sharp({create:{width:150,height:100,channels:3,background:'#6c8958'}}).png().toBuffer();
  },20000);
  afterAll(async()=>{for(const {id} of Object.values(users)){for(const table of ['email_outbox','in_app_notifications','audit_logs','refresh_sessions','password_reset_tokens','creators','brands'])await pool.execute(`DELETE FROM ${table} WHERE ${table==='audit_logs'?'actor_user_id':table==='email_outbox'||table==='in_app_notifications'?'recipient_user_id':'user_id'}=?`,[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);}for(const id of [platformId,otherPlatformId])if(id)await pool.execute('DELETE FROM platforms WHERE id=?',[id]);if(categoryId)await pool.execute('DELETE FROM categories WHERE id=?',[categoryId]);await pool.end();});
  test('empty dashboard uses real defaults, null unknown metrics and actionable next steps',async()=>{
    const response=await dashboard().expect(200),data=response.body.data;expect(response.headers['cache-control']).toBe('no-store');expect(data.profile.userId).toBe(users.CREATOR.id);expect(data.readiness).toMatchObject({completed:0,total:8,percent:0});expect(data.social).toMatchObject({count:0,activeCount:0,reportedAudienceTotal:null,accountsWithReportedAudience:0,metricsSource:'MANUAL'});expect(data.media).toMatchObject({photo:null,portfolioCount:0,verificationFileCount:0});expect(data.nextSteps).toHaveLength(9);expect(data.verification.status).toBe('PENDING');expect(data.catalog.availableCategoryCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(data)).not.toMatch(/password_hash|token_hash|fileContent|originalname|campaignCount|earnings|revenue/);
  });
  test('authentication, role and ownership restrictions include direct procedure access',async()=>{
    await request(app).get('/api/v1/creator/dashboard').expect(401);
    for(const role of ['BRAND_ADMIN','SUPER_ADMIN']){await dashboard(role).expect(403);await expect(callProcedure('sp_get_creator_dashboard',[users[role].id])).rejects.toMatchObject({sqlMessage:'CREATOR_FORBIDDEN'});}
    await request(app).get(`/api/v1/creator/dashboard?userId=${users.OTHER.id}`).set(headers()).expect(422);
    await request(app).get(`/api/v1/creator/dashboard/${creatorId}`).set(headers()).expect(404);
    expect((await dashboard('OTHER')).body.data.profile.userId).toBe(users.OTHER.id);
  });
  test('profile saves immediately update five readiness checks while independent rows remain empty',async()=>{
    await saveProfile({revision:0,bio:'Technology and lifestyle content creator.',location:'Ahmedabad, India',languages:['English','Gujarati'],skills:['Video editing'],categoryIds:[categoryId]}).expect(200);
    const data=(await dashboard().expect(200)).body.data;expect(data.readiness).toMatchObject({completed:5,total:8,percent:63});expect(data.profile.revision).toBe(1);expect(data.readiness.missing.map(row=>row.key)).toEqual(['photo','social','portfolio']);
  });
  test('photo, portfolio, evidence and social setup reaches 100% without claiming verification',async()=>{
    for(const kind of ['PHOTO','PORTFOLIO','VERIFICATION'])await upload(kind).expect(201);
    await addSocial({platformId,username:'creator.demo',profileUrl:'https://social.example.com/creator.demo',followersCount:0,averageViews:null,engagementRate:0}).expect(201);
    const data=(await dashboard().expect(200)).body.data;expect(data.readiness.percent).toBe(100);expect(data.readiness.missing).toEqual([]);expect(data.nextSteps).toEqual([]);expect(data.media.portfolioCount).toBe(1);expect(data.media.photo.kind).toBe('PHOTO');expect(data.media.verificationFileCount).toBe(1);expect(data.verification.status).toBe('PENDING');expect(data.social.reportedAudienceTotal).toBe(0);expect(data.social.accounts[0].engagementRate).toBe(0);expect(data.social.accounts[0].isVerified).toBe(false);
  });
  test('sum of reported account counts excludes unknowns and retains manual provenance',async()=>{
    const current=(await dashboard()).body.data.social.accounts[0];await request(app).put(`/api/v1/creator/social-accounts/${current.id}`).set(headers()).send({username:current.username,profileUrl:current.profileUrl,revision:current.revision,followersCount:12500,averageViews:4200,engagementRate:4.25}).expect(200);
    await addSocial({platformId:otherPlatformId,username:'other.handle',profileUrl:'https://social.example.com/other.handle'}).expect(201);
    const data=(await dashboard()).body.data;expect(data.social).toMatchObject({count:2,reportedAudienceTotal:12500,accountsWithReportedAudience:1});expect(data.social.audienceNote).toContain('overlap');expect(data.social.accounts.every(row=>row.metricsSource==='MANUAL'&&!row.isVerified)).toBe(true);
  });
  test('Super Admin review changes verification without changing completeness or social verification',async()=>{
    const evidence=await request(app).get(`/api/v1/admin/creators/${creatorId}/verification-files`).set(headers('SUPER_ADMIN')).expect(200);expect(evidence.body.data.items).toHaveLength(1);
    for(const status of ['UNDER_REVIEW','VERIFIED']){await request(app).patch(`/api/v1/admin/creators/${creatorId}/verification`).set(headers('SUPER_ADMIN')).send({status,reason:'Synthetic evidence reviewed for combined workflow test'}).expect(200);const data=(await dashboard()).body.data;expect(data.verification.status).toBe(status);expect(data.profile.verificationStatus).toBe(status);expect(data.readiness.percent).toBe(100);expect(data.social.accounts.every(row=>!row.isVerified)).toBe(true);}
  });
  test('deactivated catalog entries stay visible but no longer satisfy active readiness checks',async()=>{
    try{await pool.execute('UPDATE categories SET is_active=FALSE WHERE id=?',[categoryId]);await pool.execute('UPDATE platforms SET is_active=FALSE WHERE id IN (?,?)',[platformId,otherPlatformId]);const data=(await dashboard()).body.data;expect(data.readiness.percent).toBe(75);expect(data.readiness.missing.map(row=>row.key)).toEqual(['categories','social']);expect(data.profile.categories[0].isAvailable).toBe(false);expect(data.social.activeCount).toBe(0);expect(data.social.reportedAudienceTotal).toBe(12500);}
    finally{await pool.execute('UPDATE categories SET is_active=TRUE WHERE id=?',[categoryId]);await pool.execute('UPDATE platforms SET is_active=TRUE WHERE id IN (?,?)',[platformId,otherPlatformId]);}
  });
  test('removing files/accounts updates totals while preserving profile and admin verification',async()=>{
    const data=(await dashboard()).body.data;
    for(const file of [data.media.photo,...data.media.portfolio])await request(app).delete(`/api/v1/creator/media/${file.id}`).set(headers()).send({revision:file.revision}).expect(200);
    for(const account of data.social.accounts)await request(app).delete(`/api/v1/creator/social-accounts/${account.id}`).set(headers()).send({revision:account.revision}).expect(200);
    const updated=(await dashboard()).body.data;expect(updated.readiness.percent).toBe(63);expect(updated.social.reportedAudienceTotal).toBeNull();expect(updated.media.photo).toBeNull();expect(updated.media.portfolio).toEqual([]);expect(updated.media.verificationFileCount).toBe(1);expect(updated.profile.bio).toBe(data.profile.bio);expect(updated.profile.revision).toBe(1);expect(updated.verification.status).toBe('VERIFIED');
    const other=(await dashboard('OTHER')).body.data;expect(other.readiness.percent).toBe(0);expect(other.media.verificationFileCount).toBe(0);expect(other.verification.status).toBe('PENDING');
  });
  test('dashboard is read-only and suspension blocks HTTP and direct database access',async()=>{
    const [[before]]=await pool.execute('SELECT COUNT(*) AS total FROM audit_logs WHERE actor_user_id=?',[users.CREATOR.id]);await dashboard().expect(200);const [[after]]=await pool.execute('SELECT COUNT(*) AS total FROM audit_logs WHERE actor_user_id=?',[users.CREATOR.id]);expect(after.total).toBe(before.total);
    try{await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[users.CREATOR.id]);await dashboard().expect(401);await expect(callProcedure('sp_get_creator_dashboard',[users.CREATOR.id])).rejects.toMatchObject({sqlMessage:'CREATOR_FORBIDDEN'});}
    finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.CREATOR.id]);}
  });
});
