import { z } from 'zod';
import './env.js';

// Validate authentication settings only when authentication is used.
const schema = z.object({
  JWT_ACCESS_SECRET: z.string().min(64),
  JWT_REFRESH_SECRET: z.string().min(64),
  JWT_ISSUER: z.string().min(1).default('influencer-marketing'),
  JWT_AUDIENCE: z.string().min(1).default('influencer-web'),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  RESET_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12)
}).refine(value => value.JWT_ACCESS_SECRET !== value.JWT_REFRESH_SECRET, { message: 'Secrets must be distinct' });

export function loadAuthConfig() {
  const result = schema.safeParse(process.env);
  if (!result.success) throw new Error('Authentication configuration is invalid. Run npm run setup:auth and check backend/.env.');
  if (process.env.NODE_ENV === 'production' && (!process.env.EMAIL_HOST || !process.env.EMAIL_FROM)) throw new Error('Production authentication requires a configured SMTP host and sender.');
  return result.data;
}
