import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../.env', import.meta.url);
let contents;
try { contents = await readFile(path, 'utf8'); }
catch { throw new Error('Create backend/.env from backend/.env.example first.'); }
for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
  const expression = new RegExp(`^${key}=.*$`, 'm');
  const existing = contents.match(expression)?.[0].split('=').slice(1).join('=').trim();
  if (existing && existing !== '""' && existing !== "''") continue;
  const line = `${key}=${randomBytes(48).toString('hex')}`;
  contents = expression.test(contents) ? contents.replace(expression, line) : `${contents.trimEnd()}\n${line}\n`;
}
const defaults = {
  JWT_ISSUER: 'influencer-marketing', JWT_AUDIENCE: 'influencer-web',
  ACCESS_TOKEN_MINUTES: '15', REFRESH_TOKEN_DAYS: '7', BCRYPT_ROUNDS: '12',
  RESET_TOKEN_MINUTES: '30', EMAIL_HOST: '', EMAIL_PORT: '587', EMAIL_USER: '', EMAIL_PASSWORD: '', EMAIL_FROM: ''
};
for (const [key, value] of Object.entries(defaults)) {
  if (!new RegExp(`^${key}=`, 'm').test(contents)) contents = `${contents.trimEnd()}\n${key}=${value}\n`;
}
await writeFile(path, contents, { mode: 0o600 });
console.log('Authentication environment prepared. Existing secrets retained; no secrets displayed.');
