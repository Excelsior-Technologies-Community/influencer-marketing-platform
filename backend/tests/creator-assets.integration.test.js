import request from 'supertest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { callProcedure } from '../src/repositories/procedure.repository.js';
import { hashPassword } from '../src/utils/password.js';

describe('Module 5 Task 3 private Creator uploads with MySQL',()=>{
  const app=createApp({logging:false}),prefix=`assets-${randomUUID()}`,password='Assets-tests-password-2026',users={},tokens={};
  let png,jpeg,webp,pdf,creatorId,photo,portfolio,evidence;
  const headers=(role='CREATOR')=>({Authorization:`Bearer ${tokens[role]}`,'X-Requested-With':'InfluenceWeb'});
  const list=(role='CREATOR')=>request(app).get('/api/v1/creator/media').set(headers(role));
  const get=(id,role='CREATOR')=>request(app).get(`/api/v1/creator/media/${id}`).set(headers(role));
  const add=(kind='PHOTO',bytes=png,filename='private-original.png',mime='image/png',role='CREATOR',title='Test uploaded file')=>request(app).post('/api/v1/creator/media').set(headers(role)).field('kind',kind).field('title',title).attach('file',bytes,{filename,contentType:mime});
  const replace=(row,bytes=png)=>request(app).put(`/api/v1/creator/media/${row.id}`).set(headers()).field('title','Replaced file').field('revision',String(row.revision)).attach('file',bytes,{filename:'replacement.png',contentType:'image/png'});
  const remove=(row,role='CREATOR')=>request(app).delete(`/api/v1/creator/media/${row.id}`).set(headers(role)).send({revision:row.revision});
  const find=(response,kind)=>response.body.data.items.find(item=>item.kind===kind);
  beforeAll(async()=>{
    const hash=await hashPassword(password,10);
    for(const role of ['CREATOR','OTHER','BRAND_ADMIN','SUPER_ADMIN']){const id=randomUUID(),email=`${prefix}-${role.toLowerCase()}@example.invalid`;await callProcedure('sp_create_user',[id,role==='OTHER'?'CREATOR':role,`Test ${role}`,email,hash,role==='BRAND_ADMIN'?'Test Brand':null]);users[role]={id,email};const login=await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email,password}).expect(200);tokens[role]=login.body.data.accessToken;}
    const [[creator]]=await pool.execute('SELECT id FROM creators WHERE user_id=?',[users.CREATOR.id]);creatorId=creator.id;
    png=await sharp({create:{width:900,height:600,channels:3,background:'#75916b'}}).png().toBuffer();jpeg=await sharp(png).jpeg().toBuffer();webp=await sharp(png).webp().toBuffer();
    const document=await PDFDocument.create();document.addPage([300,200]).drawText('Synthetic evidence for automated verification only');pdf=Buffer.from(await document.save());
  },20000);
  afterAll(async()=>{for(const {id} of Object.values(users)){for(const table of ['email_outbox','in_app_notifications','audit_logs','refresh_sessions','password_reset_tokens','creators','brands'])await pool.execute(`DELETE FROM ${table} WHERE ${table==='audit_logs'?'actor_user_id':table==='email_outbox'||table==='in_app_notifications'?'recipient_user_id':'user_id'}=?`,[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);}await pool.end();});
  test('private empty list and all routes require Creator authentication',async()=>{
    const response=await list().expect(200);expect(response.body.data.items).toEqual([]);expect(response.body.data.verificationStatus).toBe('PENDING');expect(response.headers['cache-control']).toBe('no-store');
    await request(app).get('/api/v1/creator/media').expect(401);
    for(const role of ['BRAND_ADMIN','SUPER_ADMIN']){await list(role).expect(403);await add('PHOTO',png,'photo.png','image/png',role).expect(403);await get(randomUUID(),role).expect(403);await remove({id:randomUUID(),revision:1},role).expect(403);}
  });
  test('photo PNG is reencoded/resized, persisted privately and does not retain original filename or identity metadata',async()=>{
    const response=await add().expect(201);photo=find(response,'PHOTO');expect(photo.mimeType).toBe('image/webp');expect(photo.width).toBe(512);expect(photo.height).toBeLessThanOrEqual(512);expect(photo.revision).toBe(1);expect(JSON.stringify(response.body)).not.toMatch(/fileContent|private-original|password|userId/);
    const loaded=await list().expect(200);expect(find(loaded,'PHOTO')).toEqual(photo);const binary=await get(photo.id).expect(200);expect(binary.headers['content-type']).toMatch(/image\/webp/);expect(binary.headers['cache-control']).toBe('no-store');expect(binary.headers['x-content-type-options']).toBe('nosniff');expect(binary.headers['content-security-policy']).toContain('sandbox');expect(binary.headers['content-disposition']).not.toContain('private-original');expect((await sharp(binary.body).metadata()).format).toBe('webp');
    await add().expect(409);
  });
  test('portfolio accepts JPEG/WebP and PDF while verification accepts parsed PDF',async()=>{
    portfolio=find(await add('PORTFOLIO',jpeg,'sample.jpg','image/jpeg').expect(201),'PORTFOLIO');expect(portfolio.width).toBe(900);
    const extra=await add('PORTFOLIO',webp,'sample.webp','image/webp').expect(201);expect(extra.body.data.items.filter(item=>item.kind==='PORTFOLIO')).toHaveLength(2);
    await add('PORTFOLIO',pdf,'work.pdf','application/pdf').expect(201);
    const response=await add('VERIFICATION',pdf,'identity-private.pdf','application/pdf').expect(201);evidence=find(response,'VERIFICATION');expect(evidence.mimeType).toBe('application/pdf');expect(evidence.pageCount).toBe(1);expect(evidence.width).toBeNull();expect(response.body.data.verificationStatus).toBe('PENDING');
    const binary=await get(evidence.id).expect(200);expect(binary.headers['content-disposition']).toContain('attachment;');expect(binary.headers['content-type']).toContain('application/pdf');
    expect((await PDFDocument.load(binary.body)).getPageCount()).toBe(1);
  });
  test('strict owner checks protect metadata, downloads, replacements and removals',async()=>{
    expect((await list('OTHER')).body.data.items).toEqual([]);await get(photo.id,'OTHER').expect(404);await remove(photo,'OTHER').expect(404);
    await request(app).put(`/api/v1/creator/media/${photo.id}`).set(headers('OTHER')).field('title','Not my file').field('revision','1').attach('file',png,{filename:'test.png',contentType:'image/png'}).expect(404);
    await request(app).get(`/api/v1/creator/media?creatorId=${creatorId}`).set(headers()).expect(422);await get('not-a-uuid').expect(422);
    await expect(callProcedure('sp_delete_creator_asset',[users.OTHER.id,photo.id,photo.revision,randomUUID()])).rejects.toMatchObject({sqlMessage:'ASSET_NOT_FOUND'});
  });
  test('Super Admin can review only verification files through dedicated authenticated endpoints',async()=>{
    const path=`/api/v1/admin/creators/${creatorId}/verification-files`;
    const response=await request(app).get(path).set(headers('SUPER_ADMIN')).expect(200);expect(response.body.data.items.map(item=>item.id)).toEqual([evidence.id]);
    await request(app).get(`${path}/${evidence.id}`).set(headers('SUPER_ADMIN')).expect(200);await request(app).get(`${path}/${portfolio.id}`).set(headers('SUPER_ADMIN')).expect(404);
    await request(app).get(path).set(headers('BRAND_ADMIN')).expect(403);await request(app).get(path).set(headers()).expect(403);await request(app).get(`${path}/${evidence.id}`).expect(401);
    await expect(callProcedure('sp_get_creator_assets',[users.OTHER.id,creatorId,evidence.id,true,randomUUID()])).rejects.toMatchObject({sqlMessage:'CREATOR_FORBIDDEN'});
  });
  test('rejects type/extension spoofing, corrupt files, unsafe schemes and unaccepted fields',async()=>{
    await add('PORTFOLIO',png,'payload.svg','image/svg+xml').expect(422);await add('PORTFOLIO',png,'fake.jpg','image/jpeg').expect(422);await add('PORTFOLIO',Buffer.from('broken'),'broken.png','image/png').expect(422);await add('VERIFICATION',Buffer.from('%PDF-1.7\ninvalid\n%%EOF'),'broken.pdf','application/pdf').expect(422);await add('PHOTO',pdf,'photo.pdf','application/pdf').expect(422);
    await add('OTHER').expect(422);await add('PORTFOLIO',png,'test.png','image/png','CREATOR','x').expect(422);
    await request(app).post('/api/v1/creator/media').set(headers()).field('kind','PORTFOLIO').field('title','Test file').field('userId',users.OTHER.id).attach('file',png,{filename:'test.png',contentType:'image/png'}).expect(422);
    await request(app).post('/api/v1/creator/media').set(headers()).field('kind','PORTFOLIO').field('title','Missing file').expect(422);
  });
  test('rejects animated images, excessive pixel dimensions, oversized bytes and multipart abuse',async()=>{
    const animation=Buffer.concat([png.subarray(0,8),Buffer.from([0,0,0,8]),Buffer.from('acTL'),Buffer.alloc(12),png.subarray(8)]);await add('PORTFOLIO',animation).expect(422);
    const huge=await sharp({create:{width:4000,height:3000,channels:3,background:'white'}}).png().toBuffer();await add('PORTFOLIO',huge).expect(422);
    await add('PHOTO',Buffer.alloc(2*1024*1024+1)).expect(413);await add('PORTFOLIO',Buffer.alloc(5*1024*1024+1)).expect(413);
    await request(app).post('/api/v1/creator/media').set(headers()).field('kind','PORTFOLIO').field('title','Two files').attach('file',png,{filename:'one.png',contentType:'image/png'}).attach('file',png,{filename:'two.png',contentType:'image/png'}).expect(422);
  });
  test('rejects active PDFs, forms and excessive page counts',async()=>{
    const active=await PDFDocument.create();active.addPage();active.addJavaScript('test','app.alert("test")');await add('VERIFICATION',Buffer.from(await active.save()),'script.pdf','application/pdf').expect(422);
    const form=await PDFDocument.create();const page=form.addPage();form.getForm().createTextField('private').addToPage(page);await add('VERIFICATION',Buffer.from(await form.save()),'form.pdf','application/pdf').expect(422);
    const many=await PDFDocument.create();for(let index=0;index<21;index++)many.addPage();await add('VERIFICATION',Buffer.from(await many.save()),'many.pdf','application/pdf').expect(422);
  });
  test('replacement checks revisions under concurrency; stale removals cannot erase replacements',async()=>{
    const responses=await Promise.all([replace(photo),replace(photo)]);expect(responses.map(row=>row.status).sort()).toEqual([200,409]);const previous=photo;photo=find(responses.find(row=>row.status===200),'PHOTO');expect(photo.id).toBe(previous.id);expect(photo.revision).toBe(2);await remove(previous).expect(409);
    const before=(await list()).body.data.items;await replace(photo,Buffer.from('corrupt')).expect(422);expect((await list()).body.data.items).toEqual(before);
  });
  test('section quotas are enforced under simultaneous uploads',async()=>{
    // One verification PDF exists; add three, then race for the fifth slot.
    for(let index=0;index<3;index++)await add('VERIFICATION',pdf,'proof.pdf','application/pdf').expect(201);
    const responses=await Promise.all([add('VERIFICATION',pdf,'proof.pdf','application/pdf'),add('VERIFICATION',pdf,'proof.pdf','application/pdf')]);expect(responses.map(row=>row.status).sort()).toEqual([201,409]);expect((await list()).body.data.items.filter(item=>item.kind==='VERIFICATION')).toHaveLength(5);
  });
  test('mutation and database role/suspension protections apply before storing files',async()=>{
    await add('PORTFOLIO').set('Origin','https://foreign.example').expect(403);await request(app).post('/api/v1/creator/media').set('Authorization',`Bearer ${tokens.CREATOR}`).expect(403);
    await expect(callProcedure('sp_delete_creator_asset',[users.BRAND_ADMIN.id,photo.id,photo.revision,randomUUID()])).rejects.toMatchObject({sqlMessage:'CREATOR_FORBIDDEN'});
    try{await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[users.CREATOR.id]);await get(evidence.id).expect(401);await add('PORTFOLIO').expect(401);await expect(callProcedure('sp_get_creator_assets',[users.CREATOR.id,null,null,false,randomUUID()])).rejects.toMatchObject({sqlMessage:'CREATOR_FORBIDDEN'});}
    finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.CREATOR.id]);}
  });
  test('deleted photo IDs cannot affect a later photo and all metadata/audits exclude file contents',async()=>{
    await remove(photo).expect(200);await get(photo.id).expect(404);const latest=find(await add().expect(201),'PHOTO');expect(latest.id).not.toBe(photo.id);await remove(photo).expect(404);await get(latest.id).expect(200);
    const [logs]=await pool.execute("SELECT action,metadata FROM audit_logs WHERE (actor_user_id=? OR actor_user_id=?) AND entity_type='creator_assets'",[users.CREATOR.id,users.SUPER_ADMIN.id]);expect(logs.map(row=>row.action)).toEqual(expect.arrayContaining(['CREATOR_ASSET_ADDED','CREATOR_ASSET_REPLACED','CREATOR_ASSET_REMOVED','CREATOR_EVIDENCE_DOWNLOADED']));expect(JSON.stringify(logs)).not.toMatch(/private-original|identity-private|fileContent|Test uploaded file|base64/);
    const profile=await request(app).get('/api/v1/creator/profile').set(headers()).expect(200);expect(profile.body.data.profile.revision).toBe(0);expect(profile.body.data.profile.verificationStatus).toBe('PENDING');
  });
});
