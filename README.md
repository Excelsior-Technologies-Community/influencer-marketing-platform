# Influencer Marketing Platform

A full-stack marketplace that helps Brands plan creator campaigns, review applications and published content, and manage campaign funding and Creator earnings. It includes separate workspaces for Brands, Creators and Super Admins.

## Product capabilities

- **Brands** manage company and billing profiles, create campaigns, upload briefs, review applicants, coordinate approved Creators, review deliverables and monitor campaign finances.
- **Creators** maintain a profile and social links, share portfolio material, discover campaigns, apply, submit published content and view earnings.
- **Super Admins** manage accounts and reference catalogs, review campaigns and Creator verification evidence, and oversee payment records.
- **Shared workflows** include campaign conversations, reviews, notifications, audit history and financial reporting.

Social audience figures and published-post links are entered by users and are not independently verified. Payments are configured for Razorpay Test Mode in INR; Creator earnings use local test wallets. Bank transfers and production payment processing are not configured.

## Technology

- React and Vite web application
- Node.js and Express API
- MySQL database with versioned SQL migrations and stored procedures
- JWT access/refresh sessions, role-based access checks and ownership controls
- Swagger/OpenAPI reference and a Postman collection

## Requirements

- Node.js 22.12 or newer
- MySQL 8.0 or newer
- npm

## Local setup

1. Install dependencies from the project root:

   ```powershell
   npm.cmd install
   ```

2. Copy `backend/.env.example` to `backend/.env`. Set the MySQL connection values for a database that already exists. Keep `backend/.env` private; it is ignored by Git.

3. Create a local database and application account with your MySQL administrator. Replace the example password before running this SQL:

   ```sql
   CREATE DATABASE influencer_marketing CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'influencer_app'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_LOCAL_PASSWORD';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES,
     CREATE ROUTINE, ALTER ROUTINE, EXECUTE ON influencer_marketing.*
     TO 'influencer_app'@'127.0.0.1';
   ```

4. Apply and verify the database schema:

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run db:verify
   ```

5. Prepare local authentication secrets, then create your Super Admin account from an interactive terminal. The password prompt is hidden:

   ```powershell
   npm.cmd run setup:auth
   npm.cmd run setup:admin -w backend
   ```

   The Super Admin email must not already belong to another account. Do not share the password or commit `.env` files.

6. Start the API and web application:

   ```powershell
   npm.cmd run dev
   ```

   - Web application: [http://localhost:5173](http://localhost:5173)
   - API health: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)
   - Database readiness: [http://localhost:4000/api/v1/health/ready](http://localhost:4000/api/v1/health/ready)
   - API reference: [http://localhost:4000/api-docs/](http://localhost:4000/api-docs/)

See [Getting Started](docs/GETTING_STARTED.md) for account setup, environment configuration and a first-use workflow.

## API and database documentation

The machine-readable API definition is available at `/api-docs/openapi.json`. Import [the Postman collection](docs/postman/Influencer-Marketing.postman_collection.json), set its `base_url` variable to the API root, and provide credentials in your local Postman environment.

The schema and relationships are documented in the [database diagram](docs/ERD.md). SQL migrations and stored procedures live in `backend/migrations/` and `backend/stored-procedures/`.

## Configuration boundaries

- **Payments:** Test Mode only. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in `backend/.env`. Never use live keys for local practice. Bank payouts are not configured.
- **Email:** In-app notifications and the email outbox work locally. External delivery needs valid SMTP settings in `backend/.env`.
- **Social analytics:** No social network OAuth or automatic insights sync is connected. Do not treat manually entered metrics as verified analytics.
- **File storage:** Private Creator and campaign files use MySQL locally. Production object storage, retention and backups need separate setup.
- **Hosting:** The project is configured for local development. Public deployment requires separate infrastructure, secrets, HTTPS, database backup and monitoring configuration; see the [operations guide](docs/DEPLOYMENT_OPERATIONS.md).

## Repository layout

```text
backend/src/                 API configuration, routes and business services
backend/migrations/          Versioned MySQL schema
backend/stored-procedures/   Transactional database operations
backend/scripts/             Database and local account setup utilities
backend/tests/               Automated API and database checks
frontend/src/                React workspaces and shared UI
docs/                        Product setup, architecture, database and operations guides
```

## Quality checks

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run db:verify
```

The integration checks use MySQL and may create disposable test schemas. See [Quality Checks](docs/QUALITY_CHECKS.md) before running them against a database containing important data.
