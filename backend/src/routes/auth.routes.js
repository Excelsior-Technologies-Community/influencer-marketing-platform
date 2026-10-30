import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { protectMutation } from '../middlewares/origin.middleware.js';
import { loadAuthConfig } from '../config/auth.js';
import { ApiError } from '../utils/api-error.js';
import { success } from '../utils/response.js';
import { authenticate, requireRole, requireOwnership } from '../middlewares/auth.middleware.js';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators/auth.validator.js';

const cookieName = 'influence_refresh';
const cookieOptions = () => ({ httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/v1/auth', maxAge: loadAuthConfig().REFRESH_TOKEN_DAYS * 86400000 });
const validate = schema => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) throw new ApiError(422, 'Validation failed', result.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })));
  req.input = result.data;
  next();
};
const checkOrigin = protectMutation;
export function authRoutes(service, { attemptLimit = env.NODE_ENV === 'test' ? 1000 : 30 } = {}) {
  const router = Router();
  const protectedUser = authenticate(service);
  const limiter = rateLimit({ windowMs: 900000, limit: attemptLimit, skip: req => req.method === 'GET', standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => res.status(429).json({ success: false, message: 'Too many authentication attempts', errors: [] }) });
  router.use(limiter);
  router.post('/register', checkOrigin, validate(registerSchema), async (req, res) => {
    const user = await service.register(req.input);
    res.status(201); success(res, 'Account created. You can sign in.', { user });
  });
  function writeSession(res, session) {
    res.cookie(cookieName, session.refreshToken, cookieOptions());
    success(res, 'Signed in', { user: session.user, accessToken: session.accessToken });
  }
  router.post('/login', checkOrigin, validate(loginSchema), async (req, res) => writeSession(res, await service.login(req.input)));
  router.get('/me', protectedUser, (req, res) => success(res, 'Your account', { user: req.user }));
  router.get('/users/:id', protectedUser, requireOwnership(), async (req, res) => {
    const { callProcedure } = await import('../repositories/procedure.repository.js');
    const { userDto } = await import('../services/auth.service.js');
    const [user] = await callProcedure('sp_get_user_by_id', [req.params.id]);
    if (!user) throw new ApiError(404, 'Account not found');
    success(res, 'Account', { user: userDto(user) });
  });
  for (const role of ['SUPER_ADMIN', 'BRAND_ADMIN', 'CREATOR']) router.get(`/access/${role.toLowerCase()}`, protectedUser, requireRole(role), (req, res) => success(res, 'Role access verified', { user: req.user }));
  router.post('/refresh-token', checkOrigin, async (req, res) => {
    try { writeSession(res, await service.refresh(req.cookies[cookieName])); }
    catch (error) { res.clearCookie(cookieName, { ...cookieOptions(), maxAge: undefined }); throw error; }
  });
  router.post('/logout', checkOrigin, async (req, res) => {
    await service.logout(req.cookies[cookieName]);
    res.clearCookie(cookieName, { ...cookieOptions(), maxAge: undefined });
    success(res, 'Signed out');
  });
  router.post('/forgot-password', checkOrigin, validate(forgotPasswordSchema), async (req, res) => {
    await service.forgot(req.input); success(res, 'If an active account exists, password reset instructions have been sent.');
  });
  router.post('/reset-password', checkOrigin, validate(resetPasswordSchema), async (req, res) => {
    await service.reset(req.input); res.clearCookie(cookieName, { ...cookieOptions(), maxAge: undefined }); success(res, 'Password updated. Sign in again.');
  });
  return router;
}
