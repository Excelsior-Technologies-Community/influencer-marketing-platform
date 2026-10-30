import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { callProcedure } from '../src/repositories/procedure.repository.js';
import { hashPassword } from '../src/utils/password.js';

describe('Super Admin integration with MySQL',()=>{
  const app=createApp({logging:false}),prefix=`m3-${randomUUID()}`,password='Admin-test-password-2026';
  const users={},tokens={},cookies={},catalogIds={categories:[],platforms:[],'content-types':[]};
  let rootCategory,childCategory;
  function operation(method,path,body,role='SUPER_ADMIN') {
    const result=request(app)[method](`/api/v1/admin${path}`).set('X-Requested-With','InfluenceWeb');
    if(tokens[role])result.set('Authorization',`Bearer ${tokens[role]}`);
    return body===undefined?result:result.send(body);
  }
  async function login(role){const result=await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email:users[role].email,password}).expect(200);tokens[role]=result.body.data.accessToken;cookies[role]=result.headers['set-cookie'][0].split(';')[0];return result;}
  async function createCatalog(kind,body){const result=await operation('post',`/catalogs/${kind}`,body).expect(201);catalogIds[kind].push(result.body.data.item.id);return result.body.data.item;}
  beforeAll(async()=>{
    process.env.BCRYPT_ROUNDS='10';
    const hash=await hashPassword(password,10);
    for(const role of ['SUPER_ADMIN','BRAND_ADMIN','CREATOR']){
      const id=randomUUID(),email=`${prefix}-${role.toLowerCase()}@example.invalid`;
      await callProcedure('sp_create_user',[id,role,`${prefix} ${role}`,email,hash,role==='BRAND_ADMIN'?`${prefix} company`:null]);
      users[role]={id,email};await login(role);
    }
    const [brands]=await pool.execute('SELECT id FROM brands WHERE user_id=?',[users.BRAND_ADMIN.id]);users.BRAND_ADMIN.profileId=brands[0].id;
    const [creators]=await pool.execute('SELECT id FROM creators WHERE user_id=?',[users.CREATOR.id]);users.CREATOR.profileId=creators[0].id;
    for(let index=0;index<2;index++)await callProcedure('sp_create_user',[randomUUID(),'BRAND_ADMIN',`${prefix} extra${index}`,`${prefix}-extra${index}@example.invalid`,hash,`${prefix} extra company${index}`]);
  },20000);
  afterAll(async()=>{
    // Delete only fixtures owned by this test run. Catalog children before parents.
    for(const id of [...catalogIds.categories].reverse())await pool.execute('DELETE FROM categories WHERE id=?',[id]);
    for(const kind of ['platforms','content-types'])for(const id of catalogIds[kind])await pool.execute(`DELETE FROM ${kind==='platforms'?'platforms':'content_types'} WHERE id=?`,[id]);
    const [rows]=await pool.execute('SELECT id FROM users WHERE email LIKE ?',[`${prefix}%`]);
    for(const {id} of rows){for(const table of ['email_outbox','in_app_notifications','audit_logs','refresh_sessions','password_reset_tokens','brands','creators'])await pool.execute(`DELETE FROM ${table} WHERE ${table==='audit_logs'?'actor_user_id':table==='email_outbox'||table==='in_app_notifications'?'recipient_user_id':'user_id'}=?`,[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);}
    await pool.end();
  });
  test('all admin routes require authentication and the Super Admin role',async()=>{
    await request(app).get('/api/v1/admin/dashboard').expect(401);
    for(const role of ['BRAND_ADMIN','CREATOR']){
      for(const path of ['/dashboard','/brands','/creators','/catalogs/categories','/audit-logs'])await operation('get',path,undefined,role).expect(403);
      await operation('patch',`/brands/${users.BRAND_ADMIN.profileId}/status`,{status:'SUSPENDED',reason:'Unauthorized test'},role).expect(403);
      await operation('post','/catalogs/platforms',{name:'Unauthorized',code:'UNAUTHORIZED'},role).expect(403);
    }
  });
  test('dashboard and six-month trend use actual account/catalog data',async()=>{
    const response=await operation('get','/dashboard').expect(200);
    const [[counts]]=await pool.query('SELECT (SELECT COUNT(*) FROM brands) AS brands,(SELECT COUNT(*) FROM creators) AS creators');
    expect(response.body.data.stats.totalBrands).toBe(counts.brands);expect(response.body.data.stats.totalCreators).toBe(counts.creators);
    expect(response.body.data.registrations).toHaveLength(6);expect(response.body.data.registrations[5].month).toMatch(/^\d{4}-\d{2}$/);
    expect(response.body.data.stats).not.toHaveProperty('revenue');
  });
  test('brand search/pagination retain total counts on empty and later pages',async()=>{
    const first=await operation('get',`/brands?q=${prefix}&pageSize=1&page=1`).expect(200),second=await operation('get',`/brands?q=${prefix}&pageSize=1&page=2`).expect(200);
    expect(first.body.meta.total).toBe(3);expect(first.body.meta.totalPages).toBe(3);
    expect(first.body.data.items[0].id).not.toBe(second.body.data.items[0].id);
    const empty=await operation('get',`/brands?q=${prefix}&pageSize=1&page=99`).expect(200);
    expect(empty.body.data.items).toHaveLength(0);expect(empty.body.meta.total).toBe(3);
  });
  test('literal wildcard and SQL-looking searches cannot expose unrelated records',async()=>{
    for(const q of ['%','_','\' OR 1=1 --']){const response=await operation('get',`/brands?q=${encodeURIComponent(q)}`).expect(200);expect(response.body.data.items.every(row=>[row.name,row.email,row.companyName].some(value=>value.toLowerCase().includes(q.toLowerCase())))).toBe(true);if(q!=='_')expect(response.body.data.items).toHaveLength(0);}
  });
  test('creator status/verification filters and sanitized detail are available',async()=>{
    const result=await operation('get',`/creators?q=${prefix}&status=ACTIVE&verification=PENDING`).expect(200);
    expect(result.body.data.items).toHaveLength(1);
    for(const kind of ['brands','creators']){
      const role=kind==='brands'?'BRAND_ADMIN':'CREATOR';const detail=await operation('get',`/${kind}/${users[role].profileId}`).expect(200);
      expect(detail.body.data.account.userId).toBe(users[role].id);expect(JSON.stringify(detail.body)).not.toMatch(/password_hash|token_hash|auth_version/);
    }
  });
  test('bad filters, identifiers and missing records are rejected safely',async()=>{
    for(const path of ['/brands?pageSize=101','/brands?page=0','/brands?status=DELETED','/brands?verification=PENDING','/creators?unknown=value','/catalogs/other','/brands/not-a-uuid'])await operation('get',path).expect(422);
    await operation('get',`/brands/${randomUUID()}`).expect(404);
    await operation('patch',`/brands/${randomUUID()}/status`,{status:'INACTIVE',reason:'Test missing'}).expect(404);
    await operation('patch',`/brands/${users.BRAND_ADMIN.profileId}/status`,{status:'DELETED',reason:'Test blocked'}).expect(422);
    await operation('patch',`/brands/${users.BRAND_ADMIN.profileId}/status`,{status:'SUSPENDED',reason:'x'}).expect(422);
  });
  test('suspension revokes access/refresh; activation does not revive old sessions; audit records actor/reason',async()=>{
    const old=tokens.CREATOR,cookie=cookies.CREATOR;
    const suspended=await operation('patch',`/creators/${users.CREATOR.profileId}/status`,{status:'SUSPENDED',reason:'suspension test'}).expect(200);
    expect(suspended.body.data.account.status).toBe('SUSPENDED');
    await request(app).get('/api/v1/auth/me').set('Authorization',`Bearer ${old}`).expect(401);
    await request(app).post('/api/v1/auth/refresh-token').set('X-Requested-With','InfluenceWeb').set('Cookie',cookie).expect(401);
    await operation('patch',`/creators/${users.CREATOR.profileId}/status`,{status:'ACTIVE',reason:'Restore test account'}).expect(200);
    await request(app).get('/api/v1/auth/me').set('Authorization',`Bearer ${old}`).expect(401);
    await login('CREATOR');
    const audit=await operation('get',`/audit-logs?action=ACCOUNT_STATUS_CHANGED&entityId=${users.CREATOR.profileId}`).expect(200);
    expect(audit.body.meta.total).toBe(2);expect(audit.body.data.items.some(row=>row.metadata.reason==='suspension test'&&row.actorUserId===users.SUPER_ADMIN.id)).toBe(true);
    expect(audit.body.data.items[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
  });
  test('unchanged status is idempotent and brand deactivation is enforced',async()=>{
    await operation('patch',`/brands/${users.BRAND_ADMIN.profileId}/status`,{status:'ACTIVE',reason:'No change test'}).expect(200);
    const audit=await operation('get',`/audit-logs?action=ACCOUNT_STATUS_CHANGED&entityId=${users.BRAND_ADMIN.profileId}`).expect(200);expect(audit.body.meta.total).toBe(0);
    await operation('patch',`/brands/${users.BRAND_ADMIN.profileId}/status`,{status:'INACTIVE',reason:'Pause test brand'}).expect(200);
    await request(app).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({email:users.BRAND_ADMIN.email,password}).expect(401);
    await operation('patch',`/brands/${users.BRAND_ADMIN.profileId}/status`,{status:'ACTIVE',reason:'Restore test brand'}).expect(200);await login('BRAND_ADMIN');
  });
  test('verification transitions, reopening and reasons are enforced',async()=>{
    const path=`/creators/${users.CREATOR.profileId}/verification`;
    await operation('patch',path,{status:'UNDER_REVIEW',reason:'Begin evidence review'}).expect(200);
    const verified=await operation('patch',path,{status:'VERIFIED',reason:'Evidence checked'}).expect(200);expect(verified.body.data.account.verificationStatus).toBe('VERIFIED');
    await operation('patch',path,{status:'REJECTED',reason:'Cannot jump states'}).expect(409);
    await operation('patch',path,{status:'PENDING',reason:'Cannot reset history'}).expect(409);
    await operation('patch',path,{status:'UNDER_REVIEW',reason:'Reopen for review'}).expect(200);
    await operation('patch',path,{status:'REJECTED',reason:'Evidence needs correction'}).expect(200);
    await operation('patch',path,{status:'VERIFIED'}).expect(422);
    await operation('patch',`/creators/${randomUUID()}/verification`,{status:'VERIFIED',reason:'Missing creator'}).expect(404);
  });
  test('catalog mutations require request protection and verified admin at database level',async()=>{
    await request(app).post('/api/v1/admin/catalogs/categories').set('Authorization',`Bearer ${tokens.SUPER_ADMIN}`).send({name:'Missing protection'}).expect(403);
    await operation('post','/catalogs/categories',{name:'Foreign origin'}).set('Origin','https://foreign.example').expect(403);
    await expect(callProcedure('sp_admin_save_catalog',[users.CREATOR.id,'categories',null,'Blocked category',null,null,true,'Unauthorized',randomUUID()])).rejects.toMatchObject({code:'ER_SIGNAL_EXCEPTION',sqlMessage:'ADMIN_FORBIDDEN'});
  });
  test('create category/subcategory and prevent cycles, third levels and active child orphaning',async()=>{
    rootCategory=await createCatalog('categories',{name:`${prefix} category`});
    childCategory=await createCatalog('categories',{name:`${prefix} child`,parentId:rootCategory.id});
    expect(childCategory.parentName).toBe(rootCategory.name);
    await operation('post','/catalogs/categories',{name:`${prefix} third`,parentId:childCategory.id}).expect(409);
    await operation('put',`/catalogs/categories/${rootCategory.id}`,{name:rootCategory.name,parentId:childCategory.id,isActive:true,reason:'Try a cycle'}).expect(409);
    await operation('put',`/catalogs/categories/${rootCategory.id}`,{name:rootCategory.name,isActive:false,reason:'Cannot orphan active child'}).expect(409);
    await operation('put',`/catalogs/categories/${childCategory.id}`,{name:childCategory.name,parentId:childCategory.id,isActive:true,reason:'Try self parent'}).expect(409);
    await operation('post','/catalogs/categories',{name:`${prefix} missing`,parentId:2147483647}).expect(409);
  });
  test('category edit/deactivation preserve data and inactive parents block active children',async()=>{
    await operation('put',`/catalogs/categories/${childCategory.id}`,{name:childCategory.name,parentId:rootCategory.id,isActive:false,reason:'Pause test child'}).expect(200);
    await operation('put',`/catalogs/categories/${rootCategory.id}`,{name:rootCategory.name,isActive:false,reason:'Pause test parent'}).expect(200);
    await operation('post','/catalogs/categories',{name:`${prefix} inactivechild`,parentId:rootCategory.id}).expect(409);
    const list=await operation('get',`/catalogs/categories?q=${prefix}&active=false`).expect(200);expect(list.body.meta.total).toBe(2);expect(list.body.data.items.every(row=>row.isActive===false)).toBe(true);
    await operation('put',`/catalogs/categories/${childCategory.id}`,{name:childCategory.name,parentId:rootCategory.id,isActive:true,reason:'Cannot activate child'}).expect(409);
  });
  test.each(['platforms','content-types'])('%s CRUD validates unique codes, names and preserved inactive entries',async kind=>{
    const code=`TEST_${randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`,name=`${prefix.slice(0,23)} ${kind}`;
    const created=await createCatalog(kind,{name,code:code.toLowerCase()});expect(created.code).toBe(code);expect(created.isActive).toBe(true);
    await operation('post',`/catalogs/${kind}`,{name:`${name} duplicate`,code}).expect(409);
    const updated=await operation('put',`/catalogs/${kind}/${created.id}`,{name:`${name} edit`,code,isActive:false,reason:'Deactivate test entry'}).expect(200);expect(updated.body.data.item.isActive).toBe(false);
    const list=await operation('get',`/catalogs/${kind}?q=${code}&active=false&pageSize=1`).expect(200);expect(list.body.meta.total).toBe(1);
    await operation('post',`/catalogs/${kind}`,{name:'Bad code',code:'BAD-CODE'}).expect(422);
    await operation('put',`/catalogs/${kind}/2147483647`,{name:'Missing',code:'MISSING_TEST',isActive:true,reason:'Missing record'}).expect(404);
  });
  test('catalog unknown fields, duplicates, missing reasons and invalid dates fail safely',async()=>{
    await operation('post','/catalogs/categories',{name:rootCategory.name}).expect(409);
    await operation('post','/catalogs/categories',{name:'Unknown fields',code:'NOT_ALLOWED'}).expect(422);
    await operation('put',`/catalogs/categories/${rootCategory.id}`,{name:rootCategory.name}).expect(422);
    await operation('get','/catalogs/categories?active=1').expect(422);
    await operation('get','/audit-logs?from=2026-10-13&to=2026-10-12').expect(422);
    await operation('get','/audit-logs?from=bad-date').expect(422);
  });
  test('audit has filterable metadata for catalog changes without credential fields',async()=>{
    const response=await operation('get',`/audit-logs?entityType=categories&entityId=${rootCategory.id}&pageSize=1`).expect(200);
    expect(response.body.meta.total).toBe(2);expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].metadata.after.name).toBe(rootCategory.name);
    expect(JSON.stringify(response.body)).not.toMatch(/password_hash|token_hash|accessToken|refreshToken/);
    const blank=await operation('get','/audit-logs?action=NO_SUCH_ACTION').expect(200);expect(blank.body.data.items).toHaveLength(0);
  });
  test('concurrent parent deactivation and child activation cannot create an active orphan',async()=>{
    await operation('put',`/catalogs/categories/${rootCategory.id}`,{name:rootCategory.name,isActive:true,reason:'Prepare concurrency test'}).expect(200);
    const results=await Promise.all([
      operation('put',`/catalogs/categories/${rootCategory.id}`,{name:rootCategory.name,isActive:false,reason:'Concurrent parent change'}),
      operation('put',`/catalogs/categories/${childCategory.id}`,{name:childCategory.name,parentId:rootCategory.id,isActive:true,reason:'Concurrent child change'})
    ]);
    expect(results.map(result=>result.status).sort()).toEqual([200,409]);
    const [[row]]=await pool.execute('SELECT c.is_active AS childActive,p.is_active AS parentActive FROM categories c JOIN categories p ON p.id=c.parent_id WHERE c.id=?',[childCategory.id]);
    expect(Boolean(row.childActive)&&!Boolean(row.parentActive)).toBe(false);
  });
  test('deleted records cannot be revived or physically deleted through account management',async()=>{
    try{
      await pool.execute("UPDATE users SET status='DELETED' WHERE id=?",[users.BRAND_ADMIN.id]);
      await operation('patch',`/brands/${users.BRAND_ADMIN.profileId}/status`,{status:'ACTIVE',reason:'Cannot revive deleted account'}).expect(409);
      await operation('delete',`/brands/${users.BRAND_ADMIN.profileId}`).expect(404);
    }finally{await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[users.BRAND_ADMIN.id]);}
  });
});
