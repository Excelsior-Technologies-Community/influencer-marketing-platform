import { ApiError } from '../utils/api-error.js';
export function authenticate(service) {
  return async (req, res, next) => {
    const match = req.headers.authorization?.match(/^Bearer ([^ ]+)$/);
    if (!match) throw new ApiError(401, 'Authentication required');
    req.user = await service.authenticate(match[1]);
    next();
  };
}
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) throw new ApiError(401, 'Authentication required');
  if (!roles.includes(req.user.role)) throw new ApiError(403, 'Access denied');
  next();
};
export function requireOwnership(parameter = 'id') {
  return (req, res, next) => {
    if (!req.user) throw new ApiError(401, 'Authentication required');
    if (req.user.role !== 'SUPER_ADMIN' && req.user.id !== req.params[parameter]) throw new ApiError(403, 'Access denied');
    next();
  };
}
