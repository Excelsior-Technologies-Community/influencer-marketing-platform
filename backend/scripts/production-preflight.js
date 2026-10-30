import { env } from '../src/config/env.js';
import { loadAuthConfig } from '../src/config/auth.js';

try {
  if (env.NODE_ENV !== 'production') throw new Error('Set NODE_ENV=production for this check.');
  const client = new URL(env.CLIENT_URL);
  if (client.protocol !== 'https:' || client.username || client.password) throw new Error('CLIENT_URL must be an HTTPS origin without embedded credentials.');
  if (!env.DB_PASSWORD) throw new Error('DB_PASSWORD must be set.');
  loadAuthConfig();
  const payments = [env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET];
  if (payments.some(Boolean)) {
    if (!payments.every(Boolean)) throw new Error('Configure all three Razorpay Test Mode values or leave all payment values empty.');
    if (!env.RAZORPAY_KEY_ID.startsWith('rzp_test_') || env.RAZORPAY_WEBHOOK_SECRET.length < 20) throw new Error('Payment configuration must use a Test Mode key and a webhook secret of at least 20 characters.');
  }
  console.log('PASS: production environment shape, HTTPS client origin, distinct JWT secrets, SMTP sender and optional Test Mode payment configuration. Secret values were not displayed.');
} catch (error) {
  console.error(`Production preflight failed: ${error.message}`);
  process.exitCode = 1;
}
