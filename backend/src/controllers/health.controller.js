import { success } from '../utils/response.js';
import { getReadiness } from '../services/health.service.js';

export function healthControllers(checkDatabase) {
  return {
    live(req, res) { success(res, 'API is running', { status: 'ok', version: '0.1.0' }); },
    async ready(req, res) {
      const state = await getReadiness(checkDatabase);
      if (!state.ready) return res.status(503).json({ success: false, message: 'Database unavailable', errors: [] });
      success(res, 'API is ready', { database: state.database });
    }
  };
}
