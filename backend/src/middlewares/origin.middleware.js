import { isAllowedOrigin } from '../config/origins.js';
import { ApiError } from '../utils/api-error.js';
export function protectMutation(req,res,next) {
  if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
    if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) throw new ApiError(403,'Origin not allowed');
    if (req.headers['x-requested-with']!=='InfluenceWeb') throw new ApiError(403,'Missing request protection header');
  }
  next();
}
