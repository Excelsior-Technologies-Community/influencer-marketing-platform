import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { callProcedure } from '../src/repositories/procedure.repository.js';
import { hashPassword } from '../src/utils/password.js';

describe('Creator profile with real MySQL',()=>{
  const app=createApp({logging:false}),prefix=`creator-${randomUUID()}`,password='Creator-profile-test-2026',users={},tokens={};
  let creatorId,parentId,categoryId,inactiveId;
  const get=(path='',role='CREATOR')=>request(app).get(`/api/v1/creator/profile${path}`).set('Authorization',`Bearer ${tokens[role]}`);
  const put=(body,role='CREATOR')=>request(app).put('/api/v1/creator/profile').set('Authorization',`Bearer ${tokens[role]}`).set('X-Requested-With','InfluenceWeb').send(body);
  const profile=async()=>{const response=await get().expect(200);return response.body.data.profile;};
  const editable=row=>({bio:row.bio,location:row.location,languages:row.languages,skills:row.skills,categoryIds:row.categoryIds,revision:row.revision});
  beforeAll(async()=>{
    process.env.BCRYPT_ROUNDS='10';const hash=await hashPassword(password,10);
    for(const role of ['CREATOR','OTHER_CREATOR','BRAND_ADMIN','SUPER_ADMIN']){
      const id=randomUUID(),email=`${prefix}-${role.toLowerCase()}@example.invalid`,dbRole=role==='OTHER_CREATOR'?'CREATOR':role;
      await callProcedure('sp_create_user',[id,dbRole,`Test ${role}`,email,hash,role==='BRAND_ADMIN'?'Test Brand':null]);users[role]={id,email};
      const login=await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email,password}).expect(200);tokens[role]=login.body.data.accessToken;
    }
    const [[creator]]=await pool.execute('SELECT id FROM creators WHERE user_id=?',[users.CREATOR.id]);creatorId=creator.id;
    const [parent]=await pool.execute('INSERT INTO categories(name) VALUES(?)',[`${prefix} Technology`]);parentId=parent.insertId;
    const [child]=await pool.execute('INSERT INTO categories(name,parent_id) VALUES(?,?)',[`${prefix} Gadgets`,parentId]);categoryId=child.insertId;
    const [inactive]=await pool.execute('INSERT INTO categories(name,is_active) VALUES(?,FALSE)',[`${prefix} Inactive`]);inactiveId=inactive.insertId;
  },20000);
  afterAll(async()=>{
    const [rows]=await pool.execute('SELECT id FROM users WHERE email LIKE ?',[`${prefix}%`]);
    for(const {id} of rows){for(const table of ['email_outbox','in_app_notifications','audit_logs','refresh_sessions','password_reset_tokens','brands','creators'])await pool.execute(`DELETE FROM ${table} WHERE ${table==='audit_logs'?'actor_user_id':table==='email_outbox'||table==='in_app_notifications'?'recipient_user_id':'user_id'}=?`,[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);}
    for(const id of [categoryId,inactiveId,parentId])if(id)await pool.execute('DELETE FROM categories WHERE id=?',[id]);
    await pool.end();
  });
  test('registration identity and verification are read-only while empty profile fields are normalized',async()=>{
    const row=await profile();expect(row.userId).toBe(users.CREATOR.id);expect(row.name).toBe('Test CREATOR');expect(row.verificationStatus).toBe('PENDING');expect(row.bio).toBeNull();expect(row.languages).toEqual([]);expect(row.skills).toEqual([]);expect(row.categoryIds).toEqual([]);expect(row.revision).toBe(0);
    expect(JSON.stringify(row)).not.toMatch(/password_hash|token_hash|auth_version/);
    const response=await get();expect(response.headers['cache-control']).toBe('no-store');
  });
  test('all endpoints enforce authentication and Creator role',async()=>{
    await request(app).get('/api/v1/creator/profile').expect(401);
    for(const role of ['BRAND_ADMIN','SUPER_ADMIN']){await get('',role).expect(403);await get('/categories',role).expect(403);await put({revision:0},role).expect(403);}
  });
  test('category choices support hierarchy, literal search and pagination without new inactive choices',async()=>{
    const response=await get(`/categories?q=${prefix}&pageSize=1`).expect(200);expect(response.body.meta.total).toBe(2);expect(response.body.data.items).toHaveLength(1);
    const all=await get(`/categories?q=${prefix}`).expect(200);expect(all.body.data.items.some(row=>row.id===categoryId&&row.parentId===parentId&&row.isAvailable)).toBe(true);expect(all.body.data.items.some(row=>row.id===inactiveId)).toBe(false);
    const empty=await get(`/categories?q=${prefix}&page=99&pageSize=1`).expect(200);expect(empty.body.meta.total).toBe(2);expect(empty.body.data.items).toEqual([]);
    const literal=await get('/categories?q=%25').expect(200);expect(literal.body.data.items.every(row=>row.name.includes('%')||row.parentName?.includes('%'))).toBe(true);
  });
  test('bio, location, languages, skills and category links persist atomically',async()=>{
    const row=await profile(),body={...editable(row),bio:'I create helpful technology reviews and short educational videos.',location:'Ahmedabad, India',languages:['English','Hindi','Gujarati'],skills:['Video editing','Photography','Content writing'],categoryIds:[parentId,categoryId]};
    const saved=await put(body).expect(200);expect(saved.body.data.profile.revision).toBe(1);
    const loaded=await profile();expect(loaded.bio).toBe(body.bio);expect(loaded.location).toBe(body.location);expect(loaded.languages).toEqual(body.languages);expect(loaded.skills).toEqual(body.skills);expect(new Set(loaded.categoryIds)).toEqual(new Set(body.categoryIds));
    const [admin]=await callProcedure('sp_admin_get_account',['creators',creatorId]);expect(admin.bio).toBe(body.bio);expect(admin.location).toBe(body.location);
  });
  test('a second Creator cannot select the first Creator by URL, query, body or category state',async()=>{
    const own=await get('','OTHER_CREATOR').expect(200);expect(own.body.data.profile.userId).toBe(users.OTHER_CREATOR.id);expect(own.body.data.profile.bio).toBeNull();
    await get(`?userId=${users.CREATOR.id}`,'OTHER_CREATOR').expect(422);await get(`/${creatorId}`,'OTHER_CREATOR').expect(404);
    await put({revision:0,creatorId,bio:'Attempt to edit another Creator'},'OTHER_CREATOR').expect(422);
    const choices=await get(`/categories?q=${prefix}`,'OTHER_CREATOR').expect(200);expect(choices.body.data.items.every(row=>!row.isSelected)).toBe(true);
  });
  test('identity/role/verification edits, duplicate lists and invalid ranges are rejected',async()=>{
    const body=editable(await profile());
    for(const change of [{name:'Other identity'},{email:'changed@example.invalid'},{status:'ACTIVE'},{verificationStatus:'VERIFIED'},{revision:'1'},{revision:-1},{bio:'x'.repeat(3001)},{location:'x'.repeat(161)},{languages:['English','english']},{languages:['x']},{languages:Array.from({length:11},(_,i)=>`Language ${i}`)},{skills:['Editing','editing']},{skills:Array.from({length:21},(_,i)=>`Skill ${i}`)},{categoryIds:[categoryId,categoryId]},{categoryIds:['1']},{categoryIds:[-1]}])await put({...body,...change}).expect(422);
    await get('/categories?pageSize=101').expect(422);await get('/categories?unknown=value').expect(422);
  });
  test('nonexistent and newly inactive categories cannot alter profile or revision',async()=>{
    const before=await profile();for(const category of [2147483647,inactiveId])await put({...editable(before),bio:'Must roll back',categoryIds:[category]}).expect(422);
    const after=await profile();expect(after.revision).toBe(before.revision);expect(after.bio).toBe(before.bio);expect(after.categoryIds).toEqual(before.categoryIds);
  });
  test('stale and simultaneous edits cannot overwrite each other',async()=>{
    const body=editable(await profile()),responses=await Promise.all([put({...body,bio:'Concurrent profile edit A'}),put({...body,bio:'Concurrent profile edit B'})]);
    expect(responses.map(response=>response.status).sort()).toEqual([200,409]);const winner=responses.find(response=>response.status===200).body.data.profile;
    expect((await profile()).bio).toBe(winner.bio);await put({...body,bio:'Stale overwrite'}).expect(409);
  });
  test('deactivated selected categories can be retained or removed but cannot be newly added',async()=>{
    await pool.execute('UPDATE categories SET is_active=FALSE WHERE id=?',[categoryId]);
    const before=await profile();expect(before.categories.find(row=>row.id===categoryId).isAvailable).toBe(false);
    const retained=await put({...editable(before),bio:'Edit while retaining a historical category'}).expect(200);expect(retained.body.data.profile.categoryIds).toContain(categoryId);
    const own=await get(`/categories?q=${prefix}`).expect(200);expect(own.body.data.items.some(row=>row.id===categoryId&&row.isSelected&&!row.isAvailable)).toBe(true);
    const other=await get(`/categories?q=${prefix}`,'OTHER_CREATOR').expect(200);expect(other.body.data.items.some(row=>row.id===categoryId)).toBe(false);
    const current=await profile();const removed=await put({...editable(current),categoryIds:[parentId]}).expect(200);
    await put({...editable(removed.body.data.profile),categoryIds:[parentId,categoryId]}).expect(422);
  });
  test('an active child of an inactive parent is not offered as a new choice',async()=>{
    await pool.execute('UPDATE categories SET is_active=TRUE WHERE id=?',[categoryId]);await pool.execute('UPDATE categories SET is_active=FALSE WHERE id=?',[parentId]);
    try{const choices=await get(`/categories?q=${prefix}`,'OTHER_CREATOR').expect(200);expect(choices.body.data.items).toEqual([]);await put({revision:0,categoryIds:[categoryId]},'OTHER_CREATOR').expect(422);}
    finally{await pool.execute('UPDATE categories SET is_active=TRUE WHERE id=?',[parentId]);}
  });
  test('mutation protection, DB-level role checks and suspension block unauthorized writes',async()=>{
    const body=editable(await profile());await request(app).put('/api/v1/creator/profile').set('Authorization',`Bearer ${tokens.CREATOR}`).send(body).expect(403);await put(body).set('Origin','https://foreign.example').expect(403);
    await expect(callProcedure('sp_update_creator',[users.BRAND_ADMIN.id,'Denied',null,'{}','[]',0,randomUUID()])).rejects.toMatchObject({sqlMessage:'CREATOR_FORBIDDEN'});
    try{await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[users.CREATOR.id]);await get().expect(401);await put(body).expect(401);await expect(callProcedure('sp_update_creator',[users.CREATOR.id,'Denied',null,'{}','[]',0,randomUUID()])).rejects.toMatchObject({sqlMessage:'CREATOR_FORBIDDEN'});}
    finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.CREATOR.id]);}
  });
  test('profile fields and category links can be cleared without changing identity or verification',async()=>{
    const before=await profile(),saved=await put({revision:before.revision,bio:'  ',location:' ',languages:[],skills:[],categoryIds:[]}).expect(200),row=saved.body.data.profile;
    expect(row.bio).toBeNull();expect(row.location).toBeNull();expect(row.languages).toEqual([]);expect(row.skills).toEqual([]);expect(row.categories).toEqual([]);expect(row.name).toBe(before.name);expect(row.verificationStatus).toBe(before.verificationStatus);
  });
  test('profile audit records revisions and counts without storing private bio content',async()=>{
    const [rows]=await pool.execute("SELECT metadata,request_id FROM audit_logs WHERE actor_user_id=? AND action='CREATOR_PROFILE_UPDATED'",[users.CREATOR.id]);expect(rows.length).toBeGreaterThan(0);expect(rows[0].metadata).toHaveProperty('revision');expect(rows[0].request_id).toMatch(/^[a-f0-9-]{36}$/);expect(JSON.stringify(rows)).not.toMatch(/technology reviews|Concurrent profile edit|password_hash|token_hash/);
  });
});
