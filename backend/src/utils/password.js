import bcrypt from 'bcrypt';

export async function hashPassword(password, rounds = 12) {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Invalid password length');
  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) throw new Error('Invalid password hashing cost');
  return bcrypt.hash(password, rounds);
}
export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) return false;
  return bcrypt.compare(password, hash);
}
