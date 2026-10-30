import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { StringDecoder } from 'node:string_decoder';
import { randomUUID } from 'node:crypto';
import { registerSchema } from '../src/validators/auth.validator.js';
import { hashPassword } from '../src/utils/password.js';
import { loadAuthConfig } from '../src/config/auth.js';
import { callProcedure } from '../src/repositories/procedure.repository.js';
import { pool } from '../src/config/db.js';

async function askForPassword() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the password can be hidden.');
  }
  process.stdout.write('Password (12–72 UTF-8 bytes, input hidden): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const decoder = new StringDecoder('utf8');
  let password = '';
  try {
    for await (const chunk of process.stdin) {
      const input = decoder.write(chunk);
      for (const character of input) {
        if (character === '\u0003') throw new Error('Setup cancelled.');
        if (character === '\r' || character === '\n') {
          process.stdout.write('\n');
          return password;
        }
        if (character === '\u007f' || character === '\b') password = [...password].slice(0, -1).join('');
        else if (character >= ' ') password += character;
      }
    }
    throw new Error('Setup cancelled.');
  } finally {
    process.stdin.setRawMode(false);
  }
}

try {
  let input;
  if (process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      input = {
        name: await prompt.question('Super Admin name: '),
        email: await prompt.question('Super Admin email: '),
        password: await askForPassword()
      };
    } finally { prompt.close(); }
  } else {
    input = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  }
  const value = registerSchema.parse({ ...input, role: 'CREATOR' });
  await callProcedure('sp_create_user', [randomUUID(), 'SUPER_ADMIN', value.name, value.email, await hashPassword(value.password, loadAuthConfig().BCRYPT_ROUNDS), null]);
  console.log('Super Admin account created. Sign in using the credentials you supplied.');
} catch (error) { console.error(`Admin provisioning failed (${error.code || error.message || 'invalid input'}). No credentials displayed.`); process.exitCode = 1; }
finally { await pool.end(); }
