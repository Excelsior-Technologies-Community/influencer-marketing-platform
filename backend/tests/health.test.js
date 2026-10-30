import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Foundation API', () => {
  const app = createApp({ databaseCheck: async () => {}, logging: false });
  test('returns standard liveness response and security headers', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.body).toEqual({ success: true, message: 'API is running', data: { status: 'ok', version: '0.1.0' }, meta: {} });
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  test('readiness checks the database', async () => {
    const response = await request(app).get('/api/v1/health/ready').expect(200);
    expect(response.body.data.database).toBe('connected');
  });
  test('database failure returns 503 without leaking secrets', async () => {
    const unavailable = createApp({ databaseCheck: async () => { throw new Error('password=private SQL details'); }, logging: false });
    const response = await request(unavailable).get('/api/v1/health/ready').expect(503);
    expect(response.body).toEqual({ success: false, message: 'Database unavailable', errors: [] });
    expect(JSON.stringify(response.body)).not.toContain('private');
  });
  test('unknown endpoints are rejected', async () => {
    await request(app).get('/missing').expect(404);
    await request(app).post('/api/v1/auth/missing').send({}).expect(404);
  });
  test('malformed JSON returns a safe validation response', async () => {
    const response = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{').expect(400);
    expect(response.body.message).toBe('Invalid JSON body');
  });
  test('rejects oversized request bodies', async () => {
    await request(app).post('/api/v1/auth/register').send({ value: 'x'.repeat(1024 * 1024) }).expect(413);
  });
  test('permits the configured frontend origin', async () => {
    const response = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
  test('publishes OpenAPI and Swagger UI', async () => {
    const response = await request(app).get('/api-docs/openapi.json').expect(200);
    expect(response.body.paths['/health/ready'].get.responses['503']).toBeDefined();
    await request(app).get('/api-docs/').expect(200);
  });
  test('authentication attempts are rate limited without leaking request data', async () => {
    const limited = createApp({ logging: false, authAttemptLimit: 2 });
    for (let attempt=0; attempt<2; attempt++) await request(limited).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({}).expect(422);
    const result = await request(limited).post('/api/v1/auth/login').set('X-Requested-With','InfluenceWeb').send({}).expect(429);
    expect(result.body).toEqual({success:false,message:'Too many authentication attempts',errors:[]});
  });
});
