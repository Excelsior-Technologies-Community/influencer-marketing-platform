# Module 12 Task 4 — Deployment and operations handover

## Delivered

- Added a generic deployment and operations runbook covering environment separation, TLS/reverse-proxy topology, configuration/secrets, build and migration sequence, health checks, logs, background services, backup/restore, rollback and recovery.
- Added `TRUST_PROXY_HOPS` configuration for deployments behind a known reverse-proxy chain. It defaults to `0`; operators must set the fixed trusted hop count and block direct public access to the API when enabling it.
- Added `npm run production:check` to reject development mode, non-HTTPS frontend origins, missing production auth/SMTP requirements, weak/equal JWT secrets and incomplete/non-Test Mode payment settings without printing secret values.
- Linked deployment steps from the root README and module roadmap.

The preflight was executed successfully with synthetic, nonsecret production-shaped values. No real provider request or external deployment was made.

## Validate before release

1. Run `npm.cmd run production:check` with the intended protected production environment.
2. Run `npm.cmd run db:verify` against the selected database.
3. Build with the correct `VITE_API_BASE_URL`, then deploy backend/static frontend artifacts behind HTTPS.
4. Check public liveness and readiness, sign-in, role access and SMTP delivery in controlled staging accounts.
5. Before schema upgrades, back up the database, test restore into a separate schema, run migrations once, and verify the resulting database before switching traffic.

Detailed commands and limits are in [DEPLOYMENT_OPERATIONS.md](DEPLOYMENT_OPERATIONS.md).

## Completion boundary

The deployment preparation and operations runbook are complete. No production host, TLS certificate, SMTP service, database environment or provider deployment credentials were supplied; the project has not been deployed externally. Razorpay support remains Test Mode only, bank payouts are not implemented, and the current MySQL pool does not configure TLS, so production database placement must use a trusted private network until TLS is implemented and verified.
