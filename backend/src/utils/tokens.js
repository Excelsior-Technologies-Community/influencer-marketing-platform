import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { loadAuthConfig } from '../config/auth.js';
import { ApiError } from './api-error.js';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const resetToken = () => randomBytes(32).toString('hex');
export function signToken(type, user, sessionId, familyId) {
  const config = loadAuthConfig();
  return jwt.sign({ type, sid: sessionId, family: familyId, ver: user.auth_version }, type === 'access' ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET,
    { algorithm: 'HS256', subject: user.id, issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, expiresIn: type === 'access' ? `${config.ACCESS_TOKEN_MINUTES}m` : `${config.REFRESH_TOKEN_DAYS}d` });
}
export function verifyToken(type, token) {
  const config = loadAuthConfig();
  try {
    const result = jwt.verify(token, type === 'access' ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET, { algorithms: ['HS256'], issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE });
    if (result.type !== type || typeof result.sub !== 'string' || typeof result.sid !== 'string' || typeof result.family !== 'string' || !Number.isInteger(result.ver)) throw new Error('Invalid claims');
    return result;
  } catch { throw new ApiError(401, 'Authentication required'); }
}
