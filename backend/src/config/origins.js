import { env } from './env.js';

const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];

export function createOriginPolicy(clientUrl, mode) {
  const configured = new URL(clientUrl);
  const allowed = new Set([configured.origin]);
  // Development uses both Vite's numeric loopback address and localhost.
  // Keep the configured protocol/port; production accepts only its exact origin.
  if (mode !== 'production' && loopbackHosts.includes(configured.hostname)) {
    for (const hostname of loopbackHosts) {
      const alias = new URL(configured.origin);
      alias.hostname = hostname;
      allowed.add(alias.origin);
    }
  }
  return origin => typeof origin === 'string' && allowed.has(origin);
}

export const isAllowedOrigin = createOriginPolicy(env.CLIENT_URL, env.NODE_ENV);
