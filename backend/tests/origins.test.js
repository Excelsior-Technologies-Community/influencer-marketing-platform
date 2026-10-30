import request from 'supertest';
import { createOriginPolicy } from '../src/config/origins.js';
import { createApp } from '../src/app.js';
import { protectMutation } from '../src/middlewares/origin.middleware.js';

describe('Local frontend origin compatibility', () => {
  test('allows only loopback aliases at the configured protocol and port in development', () => {
    const allowed = createOriginPolicy('http://localhost:5173/', 'development');
    for (const origin of ['http://localhost:5173','http://127.0.0.1:5173','http://[::1]:5173']) expect(allowed(origin)).toBe(true);
    for (const origin of ['http://localhost:5174','https://localhost:5173','http://localhost.attacker.example:5173','http://192.168.1.1:5173','null','http://localhost:5173/path']) expect(allowed(origin)).toBe(false);
    expect(createOriginPolicy('http://127.0.0.1:5173','development')('http://localhost:5173')).toBe(true);
  });
  test('production and non-loopback configurations accept only the configured origin', () => {
    expect(createOriginPolicy('http://localhost:5173','production')('http://127.0.0.1:5173')).toBe(false);
    const allowed = createOriginPolicy('https://app.example.com/','production');
    expect(allowed('https://app.example.com')).toBe(true);
    expect(allowed('https://other.example.com')).toBe(false);
    expect(createOriginPolicy('https://app.example.com','development')('http://localhost:5173')).toBe(false);
  });
  const app = createApp({ logging:false });
  test('registration and login accept both local origins while still validating input', async () => {
    for (const origin of ['http://localhost:5173','http://127.0.0.1:5173']) {
      for (const endpoint of ['register','login']) {
        const response = await request(app).post(`/api/v1/auth/${endpoint}`).set('Origin',origin).set('X-Requested-With','InfluenceWeb').send({}).expect(422);
        expect(response.headers['access-control-allow-origin']).toBe(origin);
        expect(response.headers['access-control-allow-credentials']).toBe('true');
      }
    }
  });
  test('preflight allows local aliases and does not grant CORS to foreign origins', async () => {
    const allowed = await request(app).options('/api/v1/auth/register').set('Origin','http://127.0.0.1:5173').set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','content-type,x-requested-with').expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    const denied = await request(app).post('/api/v1/auth/register').set('Origin','https://foreign.example').set('X-Requested-With','InfluenceWeb').send({}).expect(403);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(denied.body.message).toBe('Origin not allowed');
  });
  test('profile writes use the same local origin policy and keep request protection', () => {
    let called=false;
    protectMutation({method:'PUT',headers:{origin:'http://127.0.0.1:5173','x-requested-with':'InfluenceWeb'}},{},()=>{called=true;});
    expect(called).toBe(true);
    expect(()=>protectMutation({method:'PUT',headers:{origin:'http://127.0.0.1:5173'}},{},()=>{})).toThrow('Missing request protection header');
    expect(()=>protectMutation({method:'PUT',headers:{origin:'https://foreign.example','x-requested-with':'InfluenceWeb'}},{},()=>{})).toThrow('Origin not allowed');
  });
});
