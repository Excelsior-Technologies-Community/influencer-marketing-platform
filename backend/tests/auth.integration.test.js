import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/services/auth.service.js';
import { pool } from '../src/config/db.js';
import { callProcedure } from '../src/repositories/procedure.repository.js';
import { loadAuthConfig } from '../src/config/auth.js';
import { hashPassword } from '../src/utils/password.js';
import { digest } from '../src/utils/tokens.js';

describe('Module 2 integration with actual MySQL', () => {
  const prefix = `auth-${randomUUID()}`;
  const password = 'A-strong-test-password';
  const newPassword = 'Another-strong-password';
  const accounts = {};
  const sentEmails = [];
  const app = createApp({ logging: false, authService: createAuthService({ sendEmail: async (email, token) => sentEmails.push({ email, token }) }) });
  const post = (path, body, cookie) => {
    let operation = request(app).post(`/api/v1/auth/${path}`).set('X-Requested-With', 'InfluenceWeb');
    if (cookie) operation = operation.set('Cookie', cookie);
    return operation.send(body || {});
  };
  const get = (path, token) => request(app).get(`/api/v1/auth/${path}`).set('Authorization', `Bearer ${token}`);
  const cookieOf = response => response.headers['set-cookie'][0].split(';')[0];
  const login = role => post('login', { email: accounts[role].email, password });
  beforeAll(async () => {
    process.env.BCRYPT_ROUNDS = '10';
    for (const role of ['CREATOR', 'BRAND_ADMIN']) {
      const email = `${prefix}-${role.toLowerCase()}@example.invalid`;
      const body = { name: `Test ${role}`, email, password, role };
      if (role === 'BRAND_ADMIN') body.companyName = 'Integration brand';
      const response = await post('register', body).expect(201);
      accounts[role] = response.body.data.user;
    }
    const id = randomUUID(), email = `${prefix}-admin@example.invalid`;
    await callProcedure('sp_create_user', [id, 'SUPER_ADMIN', 'Test admin', email, await hashPassword(password, 10), null]);
    accounts.SUPER_ADMIN = { id, email };
  }, 20000);
  afterAll(async () => {
    // Delete only generated fixture accounts and their records; no existing users touched.
    const [users] = await pool.execute('SELECT id FROM users WHERE email LIKE ?', [`${prefix}%`]);
    for (const { id } of users) {
      for (const table of ['email_outbox', 'in_app_notifications', 'audit_logs', 'refresh_sessions', 'password_reset_tokens', 'brands', 'creators']) {
        await pool.execute(`DELETE FROM ${table} WHERE ${table === 'audit_logs' ? 'actor_user_id' : 'user_id'} = ?`, [id]);
      }
      await pool.execute('DELETE FROM users WHERE id=?', [id]);
    }
    await pool.end();
  });
  test('registration atomically creates the correct role profile and stores only a password hash', async () => {
    const [brand] = await pool.execute('SELECT company_name FROM brands WHERE user_id=?', [accounts.BRAND_ADMIN.id]);
    const [creator] = await pool.execute('SELECT id FROM creators WHERE user_id=?', [accounts.CREATOR.id]);
    const [credentials] = await callProcedure('sp_user_login', [accounts.CREATOR.email]);
    expect(brand[0].company_name).toBe('Integration brand'); expect(creator).toHaveLength(1);
    expect(credentials.password_hash).toMatch(/^\$2b\$/);
    expect(accounts.CREATOR.password_hash).toBeUndefined();
  });
  test('rejects duplicate registration without orphan profiles', async () => {
    await post('register', { name: 'Duplicate', email: accounts.CREATOR.email, password, role: 'CREATOR' }).expect(409);
    const [rows] = await pool.execute('SELECT COUNT(*) AS count FROM creators WHERE user_id=?', [accounts.CREATOR.id]);
    expect(rows[0].count).toBe(1);
  });
  test('blocks public admin registration and client privilege fields', async () => {
    await post('register', { name:'Bad admin', email:`${prefix}-bad@example.invalid`,password,role:'SUPER_ADMIN' }).expect(422);
    await post('register', { name:'Bad creator', email:`${prefix}-bad@example.invalid`,password,role:'CREATOR',is_verified:true }).expect(422);
  });
  test('login does not reveal whether email or password was incorrect', async () => {
    const wrong = await post('login', { email:accounts.CREATOR.email,password:'Wrong-password' }).expect(401);
    const unknown = await post('login', { email:`${prefix}-unknown@example.invalid`,password }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });
  test.each(['CREATOR','BRAND_ADMIN','SUPER_ADMIN'])('login, sanitized identity and role access for %s', async role => {
    const result = await login(role).expect(200), token=result.body.data.accessToken;
    expect(result.body.data.refreshToken).toBeUndefined();
    expect(result.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(result.headers['set-cookie'][0]).toContain('SameSite=Strict');
    const me = await get('me',token).expect(200);
    expect(me.body.data.user.role).toBe(role); expect(me.body.data.user.password_hash).toBeUndefined();
    await get(`access/${role.toLowerCase()}`,token).expect(200);
    for (const other of ['CREATOR','BRAND_ADMIN','SUPER_ADMIN'].filter(value=>value!==role)) await get(`access/${other.toLowerCase()}`,token).expect(403);
  });
  test('unauthenticated, forged, expired and wrong-purpose access tokens are rejected', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
    const result=await login('CREATOR');
    await get('me',`${result.body.data.accessToken}bad`).expect(401);
    const config=loadAuthConfig(), claims=jwt.decode(result.body.data.accessToken);
    const { exp,iat,...payload }=claims;
    const expired=jwt.sign(payload,config.JWT_ACCESS_SECRET,{algorithm:'HS256',expiresIn:-1});
    await get('me',expired).expect(401);
    await get('me',decodeURIComponent(cookieOf(result).split('=').slice(1).join('='))).expect(401);
  });
  test('role checks include object ownership, with admin-wide account access', async () => {
    const creator=await login('CREATOR'),admin=await login('SUPER_ADMIN');
    await get(`users/${accounts.CREATOR.id}`,creator.body.data.accessToken).expect(200);
    await get(`users/${accounts.BRAND_ADMIN.id}`,creator.body.data.accessToken).expect(403);
    await get(`users/${accounts.BRAND_ADMIN.id}`,admin.body.data.accessToken).expect(200);
  });
  test('access tokens require correct issuer, audience and signing algorithm', async () => {
    const first=await login('CREATOR'), config=loadAuthConfig();
    const {exp,iat,...claims}=jwt.decode(first.body.data.accessToken);
    for (const token of [
      jwt.sign({...claims,iss:'another-service'},config.JWT_ACCESS_SECRET,{algorithm:'HS256',expiresIn:'5m'}),
      jwt.sign({...claims,aud:'another-client'},config.JWT_ACCESS_SECRET,{algorithm:'HS256',expiresIn:'5m'}),
      jwt.sign(claims,config.JWT_ACCESS_SECRET,{algorithm:'HS384',expiresIn:'5m'})
    ]) await get('me',token).expect(401);
  });
  test('refresh rotates; replay revokes the replacement and its access token', async () => {
    const first=await login('CREATOR'), oldCookie=cookieOf(first);
    const next=await post('refresh-token',{},oldCookie).expect(200);
    expect(cookieOf(next)).not.toBe(oldCookie);
    await get('me',first.body.data.accessToken).expect(401);
    await post('refresh-token',{},oldCookie).expect(401);
    await post('refresh-token',{},cookieOf(next)).expect(401);
    await get('me',next.body.data.accessToken).expect(401);
  });
  test('concurrent refresh never produces two active replacement sessions', async () => {
    const first=await login('CREATOR'), cookie=cookieOf(first);
    const results=await Promise.all([post('refresh-token',{},cookie),post('refresh-token',{},cookie)]);
    expect(results.map(value=>value.status).sort()).toEqual([200,401]);
    const success=results.find(value=>value.status===200);
    await get('me',success.body.data.accessToken).expect(401);
  });
  test('logout immediately invalidates both access and refresh tokens', async () => {
    const first=await login('CREATOR'),cookie=cookieOf(first);
    const response=await post('logout',{},cookie).expect(200);
    expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    await get('me',first.body.data.accessToken).expect(401);
    await post('refresh-token',{},cookie).expect(401);
    await post('logout').expect(200);
  });
  test('suspension blocks current sessions and new login immediately', async () => {
    const first=await login('CREATOR');
    try {
      await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[accounts.CREATOR.id]);
      await get('me',first.body.data.accessToken).expect(401);
      await post('refresh-token',{},cookieOf(first)).expect(401);
      await login('CREATOR').expect(401);
    } finally { await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[accounts.CREATOR.id]); }
  });
  test('cookie mutations reject foreign origins and missing protection header', async () => {
    await request(app).post('/api/v1/auth/refresh-token').expect(403);
    await post('logout').set('Origin','https://untrusted.example').expect(403);
  });
  test('expired refresh session is rejected even if its JWT is valid', async () => {
    const first=await login('CREATOR'),claims=jwt.decode(first.body.data.accessToken);
    await pool.execute('UPDATE refresh_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?',[claims.sid]);
    await post('refresh-token',{},cookieOf(first)).expect(401);
  });
  test('forgot-password is generic, delivers a hashed single-use token and reset revokes sessions', async () => {
    const first=await login('CREATOR');
    const known=await post('forgot-password',{email:accounts.CREATOR.email}).expect(200);
    const unknown=await post('forgot-password',{email:`${prefix}-unknown@example.invalid`}).expect(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.data.token).toBeUndefined();
    const mail=sentEmails.at(-1);
    const [rows]=await pool.execute('SELECT token_hash FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL',[accounts.CREATOR.id]);
    expect(rows[0].token_hash).toBe(digest(mail.token)); expect(rows[0].token_hash).not.toBe(mail.token);
    await post('reset-password',{token:mail.token,password:newPassword}).expect(200);
    await post('reset-password',{token:mail.token,password:newPassword}).expect(400);
    await get('me',first.body.data.accessToken).expect(401);
    await post('refresh-token',{},cookieOf(first)).expect(401);
    await login('CREATOR').expect(401);
    await post('login',{email:accounts.CREATOR.email,password:newPassword}).expect(200);
  });
  test('reset expiry and superseding reset requests reject old tokens', async () => {
    await post('forgot-password',{email:accounts.BRAND_ADMIN.email}); const old=sentEmails.at(-1).token;
    await post('forgot-password',{email:accounts.BRAND_ADMIN.email}); const latest=sentEmails.at(-1).token;
    await post('reset-password',{token:old,password:newPassword}).expect(400);
    await pool.execute('UPDATE password_reset_tokens SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE token_hash=?',[digest(latest)]);
    await post('reset-password',{token:latest,password:newPassword}).expect(400);
    await post('reset-password',{token:'a'.repeat(64),password:newPassword}).expect(400);
  });
});
