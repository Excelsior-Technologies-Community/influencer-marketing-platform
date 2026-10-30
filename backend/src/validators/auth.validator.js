import { z } from 'zod';

// bcrypt uses at most 72 UTF-8 bytes. Reject longer inputs rather than truncate.
const password = z.string().min(12).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes');
const email = z.email().max(254).transform(value => value.toLowerCase());
export const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(120), email, password,
  role: z.enum(['BRAND_ADMIN', 'CREATOR']),
  companyName: z.string().trim().min(2).max(160).optional()
}).refine(value => value.role !== 'BRAND_ADMIN' || Boolean(value.companyName), { path: ['companyName'], message: 'Company name is required for brand registration' });
export const loginSchema = z.strictObject({ email, password: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long') });
export const forgotPasswordSchema = z.strictObject({ email });
export const resetPasswordSchema = z.strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/), password });
