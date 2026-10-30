# Influencer Marketing Platform

A local full-stack platform for Brands, Creators and Super Admins. It uses React/Vite, Node.js/Express and MySQL with stored procedures. The supplied project document is treated as product requirements; this implementation uses MySQL as its system of record.

## Delivery status

Modules 01–11 are complete for the documented local workflows. Module 12 Tasks 1–4 cover end-to-end verification, focused security/regression checks, technical documentation and deployment/operations handover. The app has not been deployed externally; hosting and production credentials were not supplied. Integrations that require external production configuration are called out below and in the relevant module guides.

See the [module roadmap](docs/MODULES.md), [architecture and workflow notes](docs/ARCHITECTURE.md), and the [database ERD](docs/ERD.md).

For staging/production release steps, backup/restore, health monitoring and rollback guidance, see the [deployment and operations runbook](docs/DEPLOYMENT_OPERATIONS.md).

## Requirements

- Node.js 22.12 or newer
- MySQL 8.0 or newer
- npm

## Local setup

1. Install dependencies from the project root:

   ```powershell
   npm.cmd install
   ```

2. Copy `backend/.env.example` to `backend/.env` if the file does not exist. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` to a MySQL database/account for this project. Keep this file private and do not commit it.

3. Apply the database schema and verify it:

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run db:verify
   ```

   The database must already exist. Migrations create application tables, seed the baseline catalogs, and track applied SQL checksums. Do not edit applied SQL files; add a new numbered file instead.

4. Prepare authentication secrets in the local environment file:

   ```powershell
   npm.cmd run setup:module2
   ```

   Existing secrets are retained; missing access/refresh secrets are generated locally. No default Super Admin account is created. Follow [Module 2 setup](docs/MODULE_02_SETUP.md) to provision an administrator safely.

5. Start the API and web app:

   ```powershell
   npm.cmd run dev
   ```

   Web app: [http://localhost:5173](http://localhost:5173)  
   API liveness: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)  
   Database readiness: [http://localhost:4000/api/v1/health/ready](http://localhost:4000/api/v1/health/ready)  
   API reference: [http://localhost:4000/api-docs/](http://localhost:4000/api-docs/)

The development API accepts loopback browser aliases (`localhost`, `127.0.0.1`, `[::1]`) at the configured frontend protocol and port. Set `CLIENT_URL` to the frontend origin. Production permits only the exact configured origin. Behind a reverse proxy, set `TRUST_PROXY_HOPS` to the fixed number of trusted proxies and firewall direct API access; leave it `0` when the API is reached directly.

## MySQL account

Create a dedicated local database and account with your MySQL administrator. Replace the example password with a strong local value, then use matching settings in `backend/.env`.

```sql
CREATE DATABASE influencer_marketing CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'influencer_app'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_LOCAL_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES,
  CREATE ROUTINE, ALTER ROUTINE, EXECUTE ON influencer_marketing.*
  TO 'influencer_app'@'127.0.0.1';
```

For staging/production, isolate each environment and separate migration privileges from runtime privileges. Use TLS for database connections where supported, HTTPS for the web/API, and a secrets manager or protected environment injection for credentials. Never deploy with development defaults or commit `.env` files.

## Validation and database documentation

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run db:verify
```

`npm.cmd test` runs the Jest/Supertest backend suite. Several MySQL suites create disposable schemas, so the configured MySQL account needs permission to create and drop those schemas. `db:verify` checks the configured application database and retains no verification account. Focused Module 12 verification commands/results are in [Task 1](docs/MODULE_12_TASK_01.md) and [Task 2](docs/MODULE_12_TASK_02.md).

Refresh the ERD from the migrated database:

```powershell
npm.cmd run docs:erd -w backend
```

This writes `docs/ERD.md` from MySQL `information_schema`; it records table columns and foreign keys and lists views. SQL migrations and stored procedures are in `backend/migrations/` and `backend/stored-procedures/`.

## API and Postman

The live OpenAPI document is served at `/api-docs/openapi.json`; Swagger UI is at `/api-docs/`. Import [the Postman collection](docs/postman/Influencer-Marketing.postman_collection.json) and set its `base_url` variable to the API root, for example `http://localhost:4000`. Supply credentials and tokens only in your local Postman environment. The collection contains requests for authentication, role workflows, campaigns, content, funding/wallets, reviews/messages/notifications and reports; use the module guides for prerequisites and request ordering.

## Configuration-dependent features

- **Razorpay:** local payments are limited to Test Mode INR. Configure matching `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in `backend/.env`. Bank transfers are not configured. See [Module 9 Task 1](docs/MODULE_09_TASK_01.md).
- **Email:** outbox/in-app workflow works locally. SMTP delivery requires `EMAIL_HOST`, `EMAIL_FROM`, and optional `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD` settings.
- **Analytics:** reach/engagement/ROI are not fabricated; connect an authorized data provider before using those metrics.
- **Files:** local private file storage uses MySQL. Production file storage, retention, backups and restoration must be configured as part of deployment.

## Repository map

```text
backend/src/                 API config, routes, controllers, services and repositories
backend/migrations/          Versioned MySQL schema and seed SQL
backend/stored-procedures/   Parameterized business workflow procedures
backend/scripts/             Migration, verification and ERD tools
backend/tests/               Jest/Supertest unit and integration suites
frontend/src/                React app and role workspaces
docs/                        Module guides, architecture, ERD and verification
```
