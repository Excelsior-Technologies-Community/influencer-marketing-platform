# Deployment and operations handover

This is a deployment runbook for a host chosen by the project owner. No cloud provider or production credentials were supplied, so this guide prepares the release but does not publish or deploy the application.

## Runtime topology

- Build the React/Vite frontend as static files from `frontend/dist/`.
- Run one or more Node.js API instances with `npm run start -w backend` behind HTTPS termination and a reverse proxy/load balancer.
- Use a private MySQL 8 database. Keep it off the public internet; this app's MySQL pool currently does not configure TLS, so terminate/database-encrypt connections within a trusted private network or add and verify MySQL TLS before crossing a network boundary.
- Configure static hosting or the proxy to return the frontend `index.html` for client-side routes. Proxy `/api/` and `/api-docs/` to the backend. The API should not be publicly reachable around the trusted proxy when proxy-hop trust is enabled.
- Keep frontend and API same-site (preferably same origin through the proxy) because the refresh cookie is `SameSite=Strict`. If using a separate API origin, build with `VITE_API_BASE_URL` set to that HTTPS origin and set `CLIENT_URL` to the exact frontend HTTPS origin.

Node.js 22.12+ and MySQL 8.0+ are required. `NODE_ENV=production` enables Secure auth cookies and strict origin matching. Production auth requires valid JWT secrets and an SMTP host/sender; otherwise the API fails to start.

## Secrets and environment

Inject settings from the host's protected environment/secrets facility. Do not commit `.env`, put secrets in frontend `VITE_*` variables, bake them into images, or put them in Postman/shared logs. If using a private `backend/.env` file, restrict it to the service account. The Node dotenv loader does not override environment variables already injected by the host.

Required backend values:

- `NODE_ENV=production`, `PORT`, `CLIENT_URL=https://<frontend-host>`, and `TRUST_PROXY_HOPS` (the exact fixed trusted-proxy count; `0` when direct).
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` for the private MySQL environment.
- Distinct `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, each at least 64 characters; set `JWT_ISSUER`, `JWT_AUDIENCE`, token lifetimes and `BCRYPT_ROUNDS` deliberately.
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_FROM`; configure `EMAIL_USER` and `EMAIL_PASSWORD` when required by the SMTP provider. Production authentication requires at least host and sender.
- Optional payments: configure all three `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, or leave all three blank to disable the integration. This application supports Test Mode only; production key IDs are intentionally unsupported. Point the provider's signed webhook to `https://<api-host>/api/v1/payments/razorpay/webhook` and use the same webhook secret.

Set `VITE_API_BASE_URL` **at frontend build time**, not backend runtime. Leave it empty when the frontend and API share an origin; otherwise use the API's public HTTPS origin. Rebuild whenever it changes.

Run the nonsecret configuration preflight before release:

```powershell
npm.cmd run production:check
```

It checks production mode, HTTPS frontend origin, JWT requirements, required SMTP configuration and the optional Test Mode key shape. It does not connect to MySQL or to Razorpay. Then run `npm.cmd run db:verify` against the exact production database from a protected release runner.

## First deployment / release order

1. Create separate staging and production databases and protected secret sets. Do not point staging tests at production.
2. Provision a migration account with the DDL/routine permissions needed for migrations. Provision a separate runtime account with only the tested application table/procedure privileges. Procedures use `SQL SECURITY INVOKER`, so `EXECUTE` alone is not sufficient. Rehearse these grants on staging before restricting the runtime account.
3. Build from a reviewed commit using Node 22.12 or newer: `npm ci`, set the build-time `VITE_API_BASE_URL`, and run `npm run build`. Preserve the generated `frontend/dist` and the exact backend source/dependency lock as release artifacts.
4. Take a database backup and verify a restore to a separate staging database before the first production schema change.
5. Run `npm run db:migrate` once with the migration credentials. The migration runner uses a MySQL advisory lock and checksums; let it finish and inspect its result before starting application instances. MySQL DDL auto-commits, so this is not a transactional all-or-nothing schema change.
6. Run `npm run db:verify` against production. Run `npm run production:check` using the production configuration without displaying values.
7. Start the backend with `npm run start -w backend` under a service manager/container supervisor that restarts on failure and forwards SIGTERM. Publish frontend static assets and route `/api/` and `/api-docs/` to the backend.
8. Check `GET /api/v1/health` and `GET /api/v1/health/ready` through the public HTTPS host. Confirm a normal sign-in/role page and permitted-origin browser requests before opening traffic.
9. Configure Razorpay Test Mode webhook and SMTP only if those features are enabled. Verify event delivery and email in controlled test accounts; never create live payment keys because this code supports Test Mode only.

For release upgrades, review new SQL and app code together. Run one migrator; start instances only after schema operations complete. Confirm app/schema compatibility before rolling multiple versions at once.

## Health, logs and routine operations

- **Liveness:** `/api/v1/health` indicates the API process responds. It should not be used as proof that MySQL is available.
- **Readiness:** `/api/v1/health/ready` checks MySQL and returns 503 on failure. Remove an unready instance from traffic; alert on sustained failures.
- **Logs:** collect stdout/stderr from the process supervisor. The API logs request method/status/time and uses request IDs; errors intentionally omit request bodies, auth headers and SQL detail. Never add secrets, raw payment payloads or personal data to proxy/application logs.
- **Signals:** the server handles SIGTERM/SIGINT, stops accepting new requests and waits up to 10 seconds for clocks/database shutdown. Give the supervisor a slightly longer termination grace period.
- **Background work:** campaign lifecycle refresh and email outbox delivery run on a 60-second timer in the API process. The database routines serialize/lease work so multiple instances can share these timers. Monitor `campaign_clock_failed`, `email_delivery_clock_failed`, dead-letter outbox rows and database connectivity.
- **Backpressure:** set proxy/request timeouts appropriate to the API. The backend pool is capped at 10 connections per instance; size MySQL `max_connections` for instance count plus migration/operations reserve.
- **Uploads:** private evidence and profile/campaign files live in MySQL; include blob growth in storage and backup capacity planning. No public local upload directory is used.

## Backup and restore

Back up the complete database, including routines and triggers, to encrypted storage with restricted access. Financial records, authentication data, personal details and private file blobs are sensitive. Define retention, offsite protection, RPO and RTO with the operator. Schedule backups and binlogs using the selected MySQL provider's supported mechanism; routinely restore a copy and run database verification before relying on a backup.

Example Linux shell commands (the MySQL client prompts for the password; do not put it in command history):

```bash
umask 077
mysqldump --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --password \
  --single-transaction --routines --triggers --events "$DB_NAME" > "$BACKUP_DIR/influencer-$BACKUP_TIMESTAMP.sql"
```

Restore only to a **separate, empty recovery database** first, then point `DB_NAME` there and run `npm run db:verify`:

```bash
mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --password "$RECOVERY_DB" \
  < "$BACKUP_DIR/influencer-$BACKUP_TIMESTAMP.sql"
```

Confirm table/routine/trigger counts, test a sign-in and role workflow in the recovery environment, and check ledger reconciliation before approving failover. Never experiment with restore commands against the live schema.

## Rollback and recovery

There are no automatic down migrations. Because DDL may auto-commit, reverting only the application binary after a schema migration can be unsafe. Before each migration, keep the previous application artifact and take a restorable database backup. If an upgrade fails, keep traffic in maintenance mode, inspect the migration ledger and error, and prefer a reviewed forward-fix migration. Restore the backup only under an approved recovery plan after stopping writes and confirming acceptable data-loss/RPO impact. Do not edit checksummed migrations or manually delete/alter posted wallet journals, notification history or audit records to force rollback.

## Deployment limitations

No provider-specific infrastructure-as-code, container image, domain, TLS certificate, SMTP account, storage service or production database was supplied. The guide prepares a generic deployment but is not a claim that production is deployed or production-grade penetration/restore testing has occurred. External bank payouts, real payment processing, social metric imports and cloud file storage are not implemented in this local workflow.
