import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().regex(/^[a-zA-Z0-9_]+$/).default('influencer_marketing'),
  DB_USER: z.string().default('influencer_app'),
  DB_PASSWORD: z.string().default(''),
  RAZORPAY_KEY_ID:z.string().default(''),
  RAZORPAY_KEY_SECRET:z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET:z.string().default(''),
  EMAIL_HOST:z.string().default(''),
  EMAIL_PORT:z.coerce.number().int().min(1).max(65535).default(587),
  EMAIL_SECURE:z.enum(['true','false']).default('false'),
  EMAIL_USER:z.string().default(''),
  EMAIL_PASSWORD:z.string().default(''),
  EMAIL_FROM:z.string().default('')
});
const result = schema.safeParse(process.env);
if (!result.success) throw new Error(`Invalid environment fields: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
export const env = result.data;
