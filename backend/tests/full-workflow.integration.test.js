import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/utils/password.js';
import { createIsolatedDatabase } from './helpers/isolated-database.js';

// End-to-end Brand → Super Admin → Creator → Brand workflow. The database is
// disposable because notifications and financial records are immutable.
const isolated = await createIsolatedDatabase();
const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/config/db.js');
const { callProcedure } = await import('../src/repositories/procedure.repository.js');
const app = createApp({ logging: false });
const users = {}, tokens = {};
const headers = role => ({ Authorization: `Bearer ${tokens[role]}`, 'X-Requested-With': 'InfluenceWeb' });

afterAll(async () => { await pool.end(); await isolated.drop(); });

test('Brand, Super Admin and Creator complete a campaign workflow with private access boundaries', async () => {
  const password = 'End-to-end-verification-2026';
  const hash = await hashPassword(password, 10);
  for (const role of ['BRAND_ADMIN', 'CREATOR', 'SUPER_ADMIN', 'OTHER_BRAND']) {
    const id = randomUUID(), email = `e2e-${id}@example.invalid`;
    await callProcedure('sp_create_user', [id, role === 'OTHER_BRAND' ? 'BRAND_ADMIN' : role, `E2E ${role}`, email, hash, role.includes('BRAND') ? `E2E ${role}` : null]);
    users[role] = id;
    const login = await request(app).post('/api/v1/auth/login').set('X-Requested-With', 'InfluenceWeb').send({ email, password }).expect(200);
    tokens[role] = login.body.data.accessToken;
  }
  const code = () => `E_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const [p] = await pool.execute('INSERT INTO platforms(code,name) VALUES(?,?)', [code(), `E2E ${randomUUID()}`]);
  const [t] = await pool.execute('INSERT INTO content_types(code,name) VALUES(?,?)', [code(), `E2E ${randomUUID()}`]);
  const [cat] = await pool.execute('INSERT INTO categories(name) VALUES(?)', [`E2E ${randomUUID()}`]);
  const [[creator]] = await pool.execute('SELECT id FROM creators WHERE user_id=?', [users.CREATOR]);
  await pool.execute("UPDATE creators SET verification_status='VERIFIED',bio='Authentic creator content.',location='Ahmedabad' WHERE id=?", [creator.id]);
  await pool.execute("INSERT INTO creator_profiles(creator_id,details) VALUES(?,JSON_OBJECT('languages',JSON_ARRAY('English'))) ON DUPLICATE KEY UPDATE details=VALUES(details)", [creator.id]);
  await pool.execute('INSERT INTO creator_categories(creator_id,category_id) VALUES(?,?)', [creator.id, cat.insertId]);
  await pool.execute('INSERT INTO creator_social_accounts(id,creator_id,platform_id,username,profile_url) VALUES(?,?,?,?,?)', [randomUUID(), creator.id, p.insertId, 'e2e.creator', 'https://example.com/e2e-creator']);

  const brand = headers('BRAND_ADMIN'), admin = headers('SUPER_ADMIN'), creatorAuth = headers('CREATOR');
  const base = '/api/v1/brand/campaigns';
  const made = await request(app).post(base).set(brand).send({ title: `E2E campaign ${randomUUID()}`, currency: 'INR', description: 'End-to-end verification campaign brief.', requirements: 'Publish one original creator video with an ad disclosure.', totalBudget: '10000.00', creatorSlots: 1, platformIds: [p.insertId], categoryIds: [cat.insertId], contentTypeIds: [t.insertId], deliverables: [{ platformId: p.insertId, contentTypeId: t.insertId, quantity: 1, description: 'One original video' }] }).expect(201);
  const campaign = made.body.data.campaign;
  const now = Date.now();
  await request(app).put(`${base}/${campaign.id}/schedule`).set(brand).send({ revision: 0, applicationsOpenAt: new Date(now - 3600000).toISOString(), applicationDeadline: new Date(now + 86400000).toISOString(), startAt: new Date(now + 2 * 86400000).toISOString(), contentDeadline: new Date(now + 3 * 86400000).toISOString(), endAt: new Date(now + 4 * 86400000).toISOString() }).expect(200);
  const brief = await PDFDocument.create(); brief.addPage().drawText('E2E brief');
  await request(app).post(`${base}/${campaign.id}/files`).set(brand).field('kind', 'BRIEF').field('title', 'Workflow brief').attach('file', Buffer.from(await brief.save()), { filename: 'brief.pdf', contentType: 'application/pdf' }).expect(201);
  await request(app).post(`${base}/${campaign.id}/submit`).set(brand).send({ revision: 1, scheduleRevision: 1 }).expect(200);
  await request(app).post(`/api/v1/admin/campaign-reviews/${campaign.id}/decision`).set(admin).send({ revision: 2, decision: 'APPROVE', reason: 'Reviewed the E2E campaign requirements and schedule.' }).expect(200);
  await request(app).post(`${base}/${campaign.id}/lifecycle/actions`).set(brand).send({ revision: 3, action: 'PUBLISH', reason: 'Publish the approved E2E campaign.' }).expect(200);
  await request(app).get(`/api/v1/creator/campaigns/${campaign.id}`).set(creatorAuth).expect(200);
  const application = await request(app).post(`/api/v1/creator/campaigns/${campaign.id}/applications`).set(creatorAuth).send({ pitch: 'I will produce an original product demonstration with a clear advertising disclosure.' }).expect(201);
  await request(app).post(`/api/v1/brand/campaigns/${campaign.id}/applicants/${application.body.data.application.id}/decision`).set(brand).send({ decision: 'APPROVE', revision: 1, reason: 'The Creator pitch meets the campaign requirements.' }).expect(200);
  await request(app).get(`/api/v1/creator/workspaces/${campaign.id}`).set(creatorAuth).expect(200);
  await request(app).get(`/api/v1/creator/workspaces/${campaign.id}`).set(headers('OTHER_BRAND')).expect(403);

  await pool.execute('UPDATE campaign_schedules SET applications_open_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 4 DAY),application_deadline=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 3 DAY),start_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 DAY),content_deadline=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 2 DAY),end_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 3 DAY) WHERE campaign_id=?', [campaign.id]);
  await request(app).post(`${base}/${campaign.id}/lifecycle/refresh`).set(brand).send({}).expect(200);
  const submission = await request(app).post(`/api/v1/creator/workspaces/${campaign.id}/submissions`).set(creatorAuth).send({ platformId: p.insertId, contentTypeId: t.insertId, unitNumber: 1, contentUrl: 'https://example.com/published-e2e-content', caption: 'Original campaign video #ad', publishedAt: new Date(Date.now() - 3600000).toISOString(), notes: 'Synthetic end-to-end verification.' }).expect(201);
  await request(app).post(`/api/v1/brand/workspaces/${campaign.id}/submissions/${submission.body.data.submission.id}/decision`).set(brand).send({ decision: 'APPROVE', version: 1, reason: 'The submitted content meets the E2E campaign requirements.' }).expect(200);
  const progress = await request(app).get(`/api/v1/brand/workspaces/${campaign.id}/progress`).set(brand).expect(200);
  expect(progress.body.data.progress).toMatchObject({ requiredItems: 1, approvedItems: 1, canComplete: true });
  await request(app).post(`/api/v1/brand/workspaces/${campaign.id}/complete`).set(brand).send({ revision: progress.body.data.progress.revision, reason: 'All required E2E content has been approved.' }).expect(200);
  expect((await request(app).get(`/api/v1/creator/workspaces/${campaign.id}`).set(creatorAuth).expect(200)).body.data.campaign.status).toBe('COMPLETED');
  const [notifications] = await pool.execute('SELECT event_type FROM in_app_notifications WHERE recipient_user_id IN (?,?)', [users.BRAND_ADMIN, users.CREATOR]);
  expect(notifications.map(row => row.event_type)).toEqual(expect.arrayContaining(['APPLICATION_SUBMITTED', 'APPLICATION_STATUS', 'CONTENT_SUBMITTED', 'CONTENT_REVIEWED']));
});
