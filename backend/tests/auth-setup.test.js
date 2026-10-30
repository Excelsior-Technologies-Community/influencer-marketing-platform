import { registerSchema, resetPasswordSchema } from '../src/validators/auth.validator.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';

describe('Module 2 setup primitives', () => {
  const creator = { name: 'Test Creator', email: 'Creator@example.com', password: 'A-long-test-password', role: 'CREATOR' };
  test('allows creator registration and normalizes email', () => {
    expect(registerSchema.parse(creator).email).toBe('creator@example.com');
  });
  test('blocks public admin registration and unexpected credential fields', () => {
    expect(registerSchema.safeParse({ ...creator, role: 'SUPER_ADMIN' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...creator, is_verified: true }).success).toBe(false);
  });
  test('brand registration requires company identity', () => {
    expect(registerSchema.safeParse({ ...creator, role: 'BRAND_ADMIN' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...creator, role: 'BRAND_ADMIN', companyName: 'Test Brand' }).success).toBe(true);
  });
  test('rejects passwords that bcrypt would silently truncate', () => {
    expect(registerSchema.safeParse({ ...creator, password: 'a'.repeat(73) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...creator, password: '界'.repeat(25) }).success).toBe(false);
  });
  test('password hashing verifies correct input and rejects incorrect input', async () => {
    const hash = await hashPassword(creator.password, 10);
    expect(hash).not.toBe(creator.password);
    expect(await verifyPassword(creator.password, hash)).toBe(true);
    expect(await verifyPassword('Incorrect-password', hash)).toBe(false);
  });
  test('reset input requires an opaque token and a valid new password', () => {
    expect(resetPasswordSchema.safeParse({ token: 'short', password: creator.password }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: 'a'.repeat(64), password: creator.password }).success).toBe(true);
  });
});
