import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';
import { callProcedure } from '../src/repositories/procedure.repository.js';
import { pool } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import request from 'supertest';
import { readdir } from 'node:fs/promises';

let connection;
try {
  connection = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectTimeout: 3000 });
  const roles = await callProcedure('sp_get_roles');
  assert.deepEqual(roles.map(role => role.code), ['SUPER_ADMIN', 'BRAND_ADMIN', 'CREATOR']);
  const [tables] = await connection.execute('SELECT table_name FROM information_schema.tables WHERE table_schema = ?', [env.DB_NAME]);
  const tableNames=new Set(tables.map(row=>row.TABLE_NAME||row.table_name));
  for(const table of ['email_outbox','in_app_notifications','campaign_refunds','refund_history','payment_review_cases','payment_review_notes','creator_payment_releases','campaign_release_plan','wallet_accounts','wallet_journals','wallet_entries','campaign_funding','campaign_payment_attempts','campaign_payment_events','campaign_reviews','campaign_messages','campaign_message_reads','campaign_message_attachments','campaign_content_progress','content_submission_reviews','content_submission_versions','content_evidence_blobs','content_version_evidence','content_submissions','content_submission_windows','campaign_creator_allocations','campaign_applicant_review_windows','campaign_applications','campaign_application_history','creator_campaign_eligibility','creator_discoverable_campaigns','campaign_lifecycle_history','campaign_review_history','campaign_schedules','campaign_files','campaigns','campaign_platforms','campaign_categories','campaign_content_types','campaign_deliverables','roles','users','brands','brand_profiles','brand_logos','creators','creator_profiles','creator_categories','creator_social_accounts','creator_assets','refresh_sessions','password_reset_tokens','categories','platforms','content_types','audit_logs','schema_migrations'])assert.ok(tableNames.has(table));
  const [migrations] = await connection.query('SELECT name FROM schema_migrations ORDER BY name');
  const expected=[];
  for(const directory of ['migrations','stored-procedures'])for(const file of await readdir(new URL(`../${directory}/`,import.meta.url)))if(file.endsWith('.sql'))expected.push(`${directory}/${file}`);
  assert.deepEqual(migrations.map(row=>row.name).sort(),expected.sort());
  const [platforms] = await connection.query('SELECT COUNT(*) AS count FROM platforms');
  const [types] = await connection.query('SELECT COUNT(*) AS count FROM content_types');
  assert.ok(platforms[0].count>=3);
  assert.ok(types[0].count>=6);
  await assert.rejects(() => callProcedure('untrusted_procedure'), /Unsupported/);
  await connection.beginTransaction();
  const userId = randomUUID();
  const email = `foundation-${randomUUID()}@example.invalid`;
  await connection.execute('INSERT INTO users (id,role_id,name,email,password_hash) VALUES (?,3,?,?,?)', [userId, 'Foundation check', email, 'TEST-ONLY-NOT-A-LOGIN']);
  await assert.rejects(() => connection.execute('INSERT INTO users (id,role_id,name,email,password_hash) VALUES (?,3,?,?,?)', [randomUUID(), 'Duplicate', email, 'TEST-ONLY']), { code: 'ER_DUP_ENTRY' });
  await assert.rejects(() => connection.execute('INSERT INTO creators (id,user_id) VALUES (?,?)', [randomUUID(), randomUUID()]), { code: 'ER_NO_REFERENCED_ROW_2' });
  await connection.rollback();
  const [remaining] = await connection.execute('SELECT COUNT(*) AS count FROM users WHERE id = ?', [userId]);
  assert.equal(remaining[0].count, 0);
  const result = await request(createApp({ logging: false })).get('/api/v1/health/ready').expect(200);
  assert.equal(result.body.data.database, 'connected');
  console.log(`PASS: actual MySQL connection, foundation tables, ${migrations.length} tracked SQL files, catalog baseline, stored procedure/repository, duplicate constraint, foreign key, rollback and API readiness. No test accounts retained.`);
} catch (error) {
  console.error(`Database verification failed (${error.code || error.name}). No credentials displayed.`);
  process.exitCode = 1;
} finally {
  if (connection) { await connection.rollback(); await connection.end(); }
  await pool.end();
}

