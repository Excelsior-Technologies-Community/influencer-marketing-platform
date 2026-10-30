import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
export async function sendResetEmail(email, token) {
  const url = `${env.CLIENT_URL}/reset-password#token=${token}`;
  if (process.env.EMAIL_HOST && process.env.EMAIL_FROM) {
    const port = Number(process.env.EMAIL_PORT || 587);
    const transport = nodemailer.createTransport({ host: process.env.EMAIL_HOST, port, secure: port === 465, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }, connectionTimeout: 10000, socketTimeout: 10000 });
    await transport.sendMail({ from: process.env.EMAIL_FROM, to: email, subject: 'Reset your Influence password', text: `Reset your password using this link: ${url}\nIf you did not request this, ignore this email.` });
    return;
  }
  if (env.NODE_ENV === 'production') throw new Error('Email provider not configured');
  const directory = new URL('../../../.local/mail/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${randomUUID()}.json`, directory), JSON.stringify({ to: email, subject: 'Reset your Influence password', resetUrl: url, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}
