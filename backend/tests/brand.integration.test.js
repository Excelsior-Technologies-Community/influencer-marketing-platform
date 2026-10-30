import request from 'supertest';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { callProcedure } from '../src/repositories/procedure.repository.js';
import { hashPassword } from '../src/utils/password.js';

describe('Brand workspace integration with MySQL',()=>{
  const app=createApp({logging:false}),prefix=`m4-${randomUUID()}`,password='Brand-test-password-2026',users={},tokens={};
  let png,brandId;
  const get=(path,role='BRAND_ADMIN')=>request(app).get(`/api/v1/brand${path}`).set('Authorization',`Bearer ${tokens[role]}`);
  const put=(input,role='BRAND_ADMIN')=>request(app).put('/api/v1/brand/profile').set('Authorization',`Bearer ${tokens[role]}`).set('X-Requested-With','InfluenceWeb').send(input);
  const upload=(buffer,revision,filename='logo.png',mime='image/png',role='BRAND_ADMIN')=>request(app).post('/api/v1/brand/profile/logo').set('Authorization',`Bearer ${tokens[role]}`).set('X-Requested-With','InfluenceWeb').field('revision',String(revision)).attach('logo',buffer,{filename,contentType:mime});
  const remove=revision=>request(app).delete('/api/v1/brand/profile/logo').set('Authorization',`Bearer ${tokens.BRAND_ADMIN}`).set('X-Requested-With','InfluenceWeb').send({revision});
  const profile=async()=>{const result=await get('/profile').expect(200);return result.body.data.profile;};
  const writable=row=>({companyName:row.companyName,website:row.website,industry:row.industry,description:row.description,contactName:row.contactName,contactEmail:row.contactEmail,phone:row.phone,location:row.location,socialLinks:row.socialLinks,billing:row.billing,revision:row.revision});
  beforeAll(async()=>{
    process.env.BCRYPT_ROUNDS='10';const hash=await hashPassword(password,10);
    for(const role of ['BRAND_ADMIN','OTHER_BRAND','CREATOR','SUPER_ADMIN']){
      const id=randomUUID(),email=`${prefix}-${role.toLowerCase()}@example.invalid`,dbRole=role==='OTHER_BRAND'?'BRAND_ADMIN':role;
      await callProcedure('sp_create_user',[id,dbRole,`${prefix} ${role}`,email,hash,dbRole==='BRAND_ADMIN'?`${prefix} company ${role}`:null]);users[role]={id,email};
      const login=await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email,password}).expect(200);tokens[role]=login.body.data.accessToken;
    }
    const [rows]=await pool.execute('SELECT id FROM brands WHERE user_id=?',[users.BRAND_ADMIN.id]);brandId=rows[0].id;
    png=await sharp({create:{width:900,height:600,channels:3,background:'#457349'}}).png().toBuffer();
  },20000);
  afterAll(async()=>{
    const [rows]=await pool.execute('SELECT id FROM users WHERE email LIKE ?',[`${prefix}%`]);
    for(const {id} of rows){for(const table of ['email_outbox','in_app_notifications','audit_logs','refresh_sessions','password_reset_tokens','brands','creators'])await pool.execute(`DELETE FROM ${table} WHERE ${table==='audit_logs'?'actor_user_id':table==='email_outbox'||table==='in_app_notifications'?'recipient_user_id':'user_id'}=?`,[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);}
    await pool.end();
  });
  test('read starts from registration identity with null extended fields and actual readiness',async()=>{
    const result=await get('/dashboard').expect(200),row=result.body.data.profile;
    expect(row.companyName).toBe(`${prefix} company BRAND_ADMIN`);expect(row.accountEmail).toBe(users.BRAND_ADMIN.email);expect(row.revision).toBe(0);expect(row.logo).toBeNull();
    expect(row.billing.country).toBeNull();expect(row.socialLinks.instagram).toBeNull();expect(result.body.data.readiness.completed).toBe(1);expect(result.body.data).not.toHaveProperty('revenue');
    expect(JSON.stringify(row)).not.toMatch(/password_hash|token_hash|auth_version/);
  });
  test('unauthenticated users and other roles cannot read or update Brand data',async()=>{
    await request(app).get('/api/v1/brand/profile').expect(401);
    for(const role of ['CREATOR','SUPER_ADMIN']){await get('/dashboard',role).expect(403);await get('/profile',role).expect(403);await get('/profile/logo',role).expect(403);await put({companyName:'Denied',revision:0},role).expect(403);await upload(png,0,'logo.png','image/png',role).expect(403);}
  });
  test('a brand can only access its own identity; foreign identifiers and fields are rejected',async()=>{
    const other=await get('/profile','OTHER_BRAND').expect(200);expect(other.body.data.profile.userId).toBe(users.OTHER_BRAND.id);expect(other.body.data.profile.id).not.toBe(brandId);
    await get(`/profile?brandId=${brandId}`,'OTHER_BRAND').expect(422);await get(`/profile/${brandId}`,'OTHER_BRAND').expect(404);
    await put({companyName:'Attempt',revision:0,userId:users.BRAND_ADMIN.id},'OTHER_BRAND').expect(422);
    await expect(callProcedure('sp_update_brand',[users.CREATOR.id,'Denied',null,null,null,'{}',0,randomUUID()])).rejects.toMatchObject({sqlMessage:'BRAND_FORBIDDEN'});
  });
  test('company/contact/social/billing details persist and the account email stays unchanged',async()=>{
    const current=await profile(),body={...writable(current),companyName:`${prefix} Updated`,website:'https://brand.example',industry:'Technology',description:'A company profile for integration verification.',contactName:'Brand contact',contactEmail:'Contact@example.invalid',phone:'+91 98765 43210',location:'Ahmedabad, India',socialLinks:{instagram:'https://instagram.com/example',facebook:'https://facebook.com/example',youtube:'https://youtube.com/@example'},billing:{name:'Billing Company',email:'billing@example.invalid',taxId:'TEST-ID-ONLY',addressLine1:'Test address',addressLine2:null,city:'Ahmedabad',state:'Gujarat',postalCode:'380001',country:'India'}};
    const saved=await put(body).expect(200);expect(saved.body.data.profile.revision).toBe(1);
    const loaded=await profile();expect(loaded.companyName).toBe(body.companyName);expect(loaded.contactEmail).toBe('contact@example.invalid');expect(loaded.billing.taxId).toBe('TEST-ID-ONLY');expect(loaded.accountEmail).toBe(users.BRAND_ADMIN.email);
    const dashboard=await get('/dashboard').expect(200);expect(dashboard.body.data.readiness.completed).toBe(7);expect(dashboard.body.data.readiness.billingReady).toBe(true);
    const [record]=await callProcedure('sp_admin_get_account',['brands',brandId]);expect(record.companyName).toBe(body.companyName);expect(record.website).toBe(body.website);
  });
  test('stale and concurrent profile edits do not overwrite current data',async()=>{
    const row=await profile(),body=writable(row);const results=await Promise.all([put({...body,companyName:`${prefix} Concurrent A`}),put({...body,companyName:`${prefix} Concurrent B`})]);
    expect(results.map(result=>result.status).sort()).toEqual([200,409]);
    const winner=results.find(result=>result.status===200).body.data.profile;
    expect((await profile()).companyName).toBe(winner.companyName);
    await put({...body,companyName:'Stale override'}).expect(409);
  });
  test('profile rejects privilege escalation, unsafe URLs, invalid contacts and excessive values',async()=>{
    const row=await profile(),body=writable(row);
    for(const change of [{status:'ACTIVE'},{brandId:brandId},{revision:-1},{revision:'1'},{companyName:'x'},{website:'javascript:alert(1)'},{website:'https://user:secret@example.com'},{contactEmail:'invalid'},{phone:'not-a-phone'},{description:'x'.repeat(5001)},{socialLinks:{instagram:'data:text/html,unsafe'}},{billing:{bankAccount:'not-allowed'}}])await put({...body,...change}).expect(422);
    await request(app).put('/api/v1/brand/profile').set('Authorization',`Bearer ${tokens.BRAND_ADMIN}`).send(body).expect(403);
    await put(body).set('Origin','https://foreign.example').expect(403);
  });
  test('logo upload resizes/re-encodes and serves a private image with correct headers',async()=>{
    const row=await profile();await get('/profile/logo').expect(404);
    const response=await upload(png,row.logoRevision).expect(200),saved=response.body.data.profile;
    expect(saved.logo.mimeType).toBe('image/webp');expect(saved.logo.width).toBe(512);expect(saved.logo.height).toBeLessThanOrEqual(512);expect(saved.logoRevision).toBe(1);
    const image=await get('/profile/logo').expect(200);expect(image.headers['content-type']).toContain('image/webp');expect(image.headers['cache-control']).toBe('no-store');expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect((await sharp(image.body).metadata()).format).toBe('webp');expect((await get('/dashboard')).body.data.readiness.percent).toBe(100);
    await get('/profile/logo','OTHER_BRAND').expect(404);
  });
  test('wrong file types, extensions, MIME spoofing and corrupt images are rejected',async()=>{
    const revision=(await profile()).logoRevision;
    for(const [buffer,name,mime] of [[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'image.svg','image/svg+xml'],[Buffer.from('<svg/>'),'image.png','image/png'],[png,'image.jpg','image/jpeg'],[png,'image.exe','image/png'],[Buffer.from([137,80,78,71,13,10,26,10,1,2,3]),'image.png','image/png']])await upload(buffer,revision,name,mime).expect(422);
    const giant=await sharp({create:{width:9000,height:1,channels:3,background:'white'}}).png().toBuffer();await upload(giant,revision).expect(422);
  });
  test('oversized uploads and unexpected multipart fields/files are bounded',async()=>{
    const revision=(await profile()).logoRevision;
    await upload(Buffer.alloc(2*1024*1024+1),revision).expect(413);
    await request(app).post('/api/v1/brand/profile/logo').set('Authorization',`Bearer ${tokens.BRAND_ADMIN}`).set('X-Requested-With','InfluenceWeb').field('revision',String(revision)).field('brandId',brandId).attach('logo',png,{filename:'logo.png',contentType:'image/png'}).expect(422);
    await request(app).post('/api/v1/brand/profile/logo').set('Authorization',`Bearer ${tokens.BRAND_ADMIN}`).set('X-Requested-With','InfluenceWeb').field('revision',String(revision)).expect(422);
  });
  test.each([['jpeg','logo.jpg','image/jpeg'],['webp','logo.webp','image/webp']])('valid %s logos are supported',async(format,name,mime)=>{
    const row=await profile(),image=await sharp(png)[format]().toBuffer();
    const result=await upload(image,row.logoRevision,name,mime).expect(200);
    expect(result.body.data.profile.logo.mimeType).toBe('image/webp');expect(result.body.data.profile.logoRevision).toBe(row.logoRevision+1);
  });
  test('logo pixel bounds, animation declarations and malformed revisions fail without replacing the asset',async()=>{
    const before=await profile();
    const pixels=await sharp({create:{width:3200,height:3200,channels:3,background:'white'}}).png().toBuffer();await upload(pixels,before.logoRevision).expect(422);
    // Add an APNG animation-control declaration; reject before invoking the decoder.
    const animation=Buffer.alloc(20);animation.writeUInt32BE(8,0);animation.write('acTL',4,'ascii');animation.writeUInt32BE(2,8);
    await upload(Buffer.concat([png.subarray(0,33),animation,png.subarray(33)]),before.logoRevision).expect(422);
    await upload(png,'').expect(422);await upload(png,'1e0').expect(422);
    const after=await profile();expect(after.logo.hash).toBe(before.logo.hash);expect(after.logoRevision).toBe(before.logoRevision);
  });
  test('logo edits conflict on stale revisions, while profile and logo revisions are independent',async()=>{
    const before=await profile();
    const alternate=await sharp({create:{width:80,height:80,channels:3,background:'#123456'}}).png().toBuffer();
    const results=await Promise.all([upload(png,before.logoRevision),upload(alternate,before.logoRevision)]);expect(results.map(result=>result.status).sort()).toEqual([200,409]);
    const after=await profile();expect(after.revision).toBe(before.revision);expect(after.logoRevision).toBe(before.logoRevision+1);
    await remove(before.logoRevision).expect(409);
  });
  test('logo removal retains a monotonic revision and does not allow ABA overwrites',async()=>{
    const before=await profile(),deleted=await remove(before.logoRevision).expect(200);
    expect(deleted.body.data.profile.logo).toBeNull();expect(deleted.body.data.profile.logoRevision).toBe(before.logoRevision+1);await get('/profile/logo').expect(404);
    await upload(png,before.logoRevision).expect(409);
    const replacement=await upload(png,deleted.body.data.profile.logoRevision).expect(200);expect(replacement.body.data.profile.logoRevision).toBe(before.logoRevision+2);
    await remove(before.logoRevision).expect(409);
  });
  test('audit contains profile/logo events without billing/contact secrets or image bytes',async()=>{
    const [events]=await pool.execute('SELECT action,metadata FROM audit_logs WHERE actor_user_id=? AND entity_type=?',[users.BRAND_ADMIN.id,'brands']);
    expect(events.some(event=>event.action==='BRAND_PROFILE_UPDATED')).toBe(true);expect(events.some(event=>event.action==='BRAND_LOGO_UPDATED')).toBe(true);expect(events.some(event=>event.action==='BRAND_LOGO_REMOVED')).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/TEST-ID-ONLY|billing@example.invalid|password_hash|token_hash/);
  });
  test('suspension revokes profile access and prevents database-level updates',async()=>{
    try{await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[users.BRAND_ADMIN.id]);await get('/profile').expect(401);await get('/profile/logo').expect(401);await expect(callProcedure('sp_update_brand',[users.BRAND_ADMIN.id,'Denied',null,null,null,'{}',0,randomUUID()])).rejects.toMatchObject({sqlMessage:'BRAND_FORBIDDEN'});}
    finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.BRAND_ADMIN.id]);}
  });
});
