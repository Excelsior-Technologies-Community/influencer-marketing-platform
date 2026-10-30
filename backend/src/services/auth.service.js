import { randomUUID } from 'node:crypto';
import { callProcedure } from '../repositories/procedure.repository.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken, verifyToken, digest, resetToken } from '../utils/tokens.js';
import { loadAuthConfig } from '../config/auth.js';
import { ApiError } from '../utils/api-error.js';
import { sendResetEmail } from './email.service.js';

export const userDto = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, status: user.status });
const future = milliseconds => new Date(Date.now() + milliseconds);
const invalid = () => new ApiError(401, 'Authentication required');
export function createAuthService({ sendEmail = sendResetEmail } = {}) {
  async function issue(user) {
    const config = loadAuthConfig();
    const id = randomUUID(), family = randomUUID();
    const refreshToken = signToken('refresh', user, id, family);
    await callProcedure('sp_create_session', [id, user.id, digest(refreshToken), family, future(config.REFRESH_TOKEN_DAYS * 86400000), user.auth_version]);
    return { user: userDto(user), accessToken: signToken('access', user, id, family), refreshToken };
  }
  return {
    async register(input) {
      const config = loadAuthConfig();
      const id = randomUUID();
      await callProcedure('sp_create_user', [id, input.role, input.name, input.email, await hashPassword(input.password, config.BCRYPT_ROUNDS), input.companyName || null]);
      const [user] = await callProcedure('sp_get_user_by_id', [id]);
      return userDto(user);
    },
    async login(input) {
      const [user] = await callProcedure('sp_user_login', [input.email]);
      // Run bcrypt even for unknown emails to reduce account enumeration timing.
      const hash = user?.password_hash || '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
      const matched = await verifyPassword(input.password, hash);
      if (!user || !matched || user.status !== 'ACTIVE') throw new ApiError(401, 'Invalid email or password');
      return issue(user);
    },
    async authenticate(token) {
      const claims = verifyToken('access', token);
      const [session] = await callProcedure('sp_get_session', [claims.sid]);
      if (!session || session.user_id !== claims.sub || session.family_id !== claims.family || session.revoked_at || new Date(session.expires_at) <= new Date() || session.status !== 'ACTIVE' || session.current_version !== claims.ver || session.auth_version !== claims.ver) throw invalid();
      const [user] = await callProcedure('sp_get_user_by_id', [claims.sub]);
      return userDto(user);
    },
    async refresh(token) {
      const claims = verifyToken('refresh', token);
      const [user] = await callProcedure('sp_get_user_by_id', [claims.sub]);
      if (!user || user.status !== 'ACTIVE' || user.auth_version !== claims.ver) throw invalid();
      const id = randomUUID();
      const replacement = signToken('refresh', user, id, claims.family);
      const [result] = await callProcedure('sp_rotate_session', [claims.sid, digest(token), id, digest(replacement), future(loadAuthConfig().REFRESH_TOKEN_DAYS * 86400000)]);
      if (result.result !== 'OK') throw invalid();
      return { user: userDto(user), accessToken: signToken('access', user, id, claims.family), refreshToken: replacement };
    },
    async logout(token) {
      if (!token) return;
      let claims;
      try { claims = verifyToken('refresh', token); } catch { return; }
      await callProcedure('sp_revoke_session', [claims.sid, digest(token)]);
    },
    async forgot(input) {
      const [user] = await callProcedure('sp_user_login', [input.email]);
      if (!user || user.status !== 'ACTIVE') return;
      const token = resetToken();
      await callProcedure('sp_issue_reset', [randomUUID(), user.id, digest(token), future(loadAuthConfig().RESET_TOKEN_MINUTES * 60000)]);
      try { await sendEmail(input.email, token); } catch { console.error(JSON.stringify({ event: 'reset_email_delivery_failed' })); }
    },
    async reset(input) {
      await callProcedure('sp_change_password', [digest(input.token), await hashPassword(input.password, loadAuthConfig().BCRYPT_ROUNDS)]);
    }
  };
}
