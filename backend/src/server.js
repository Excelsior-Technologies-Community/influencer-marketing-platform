import {startCampaignClock} from './services/campaign-clock.service.js';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import {startEmailDeliveryClock} from './services/email-delivery.service.js';

const server = createApp().listen(env.PORT);
let stopClock=async()=>{},stopEmailClock=async()=>{};
server.once('listening', () => {stopClock=startCampaignClock();stopEmailClock=startEmailDeliveryClock();console.log(`API: http://localhost:${env.PORT} | Docs: http://localhost:${env.PORT}/api-docs/`);});
server.on('error', async error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${env.PORT} is already in use. Stop the other project server, then run npm run dev again.`);
  } else {
    console.error(`Server could not start (${error.code || 'unknown'})`);
  }
  process.exitCode = 1;
  await stopClock();
  await stopEmailClock();
  await pool.end();
});
function shutdown() {
  const timeout = setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => { await stopClock(); await stopEmailClock(); await pool.end(); clearTimeout(timeout); process.exit(0); });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
