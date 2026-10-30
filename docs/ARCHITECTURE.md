# System Architecture

## Overview

The platform connects Brand teams with Creators through a protected web application and a versioned API. MySQL is the system of record. Business operations that span several related rows are performed in stored procedures and committed atomically.

```text
React web app  →  Express REST API  →  services and repositories  →  MySQL
                                         ├─ stored procedures
                                         ├─ private file records
                                         └─ email/payment adapters
```

## Application areas

### Brand workspace

Brands maintain company and billing information, prepare campaign descriptions and briefs, define schedules and deliverables, submit campaigns for review, and publish approved campaigns when their application window opens. They can evaluate applications, coordinate approved Creators, review submitted content, and inspect campaign funding and reporting.

### Creator workspace

Creators maintain a profile, select content categories, add social account links and self-reported audience metrics, and manage private profile media. They can discover eligible live campaigns, submit applications, access allocated campaign briefs, submit published content, respond to review feedback and review wallet activity.

### Super Admin workspace

Super Admins manage account status, Creator verification decisions, categories, platforms and content types. They review campaign submissions and oversee payment-related records. Verification evidence and account details are access-controlled and audited.

## Backend design

- **Routes** define HTTP endpoints and middleware.
- **Controllers** validate requests and format standard responses.
- **Services** apply workflow rules and map database results to API responses.
- **Repositories** call parameterized MySQL stored procedures.
- **Stored procedures** enforce ownership, revisions, transactional state changes, audit entries and concurrency rules near the data.

The API provides OpenAPI documentation at `/api-docs/` and `/api-docs/openapi.json`. The Postman collection is in `docs/postman/`.

## Identity and access

Accounts use the `SUPER_ADMIN`, `BRAND_ADMIN` and `CREATOR` roles. Access and refresh tokens support authenticated sessions. Refresh token rotation detects reuse; password recovery uses short-lived, single-use tokens. Protected operations derive account ownership from the authenticated session rather than accepting an arbitrary owner ID from the client.

Mutations use origin/request protections, input validation and rate limits. Responses omit credentials, password hashes, token material, private verification evidence and file bytes unless a specific authorized download endpoint is used. Audit records avoid storing passwords, secrets, pitches or other unnecessary private text.

## Main data domains

- **Accounts and catalogs:** users, roles, categories, social platforms and content types.
- **Profiles:** Brand company and billing data; Creator profile details, categories, social links and private media.
- **Campaigns:** campaign description, budget, currency, Creator slots, selected catalog entries, deliverables, schedule, brief and review history.
- **Collaboration:** applications, allocation, campaign workspace access, conversations, content submissions, evidence versions and attributed reviews.
- **Finance:** payment attempts, funding events, refunds, wallet accounts, balanced ledger postings, Creator earnings releases and reports.
- **Operations:** notifications, email outbox, audit history and activity analytics.

See [ERD](ERD.md) for table and relationship details.

## Campaign lifecycle

Campaign preparation begins as a private draft. The schedule must follow this order: applications open, application deadline, campaign start, content deadline and campaign end. A campaign brief is required before review. A Super Admin approves or returns the submission; the Brand publishes an approved campaign after its application window opens. Creators can apply only while it is discoverable and eligible. Approved applications allocate Creator slots and grant workspace access.

Campaign completion depends on required content being submitted and approved. Review entries are attributed to their author and recipient. Lifecycle and financial actions record history so changes remain traceable.

## Payments and earnings

Local funding uses Razorpay Test Mode and INR. Verified funding is reconciled before campaign wallet credits are posted. Ledger postings are balanced and immutable. The configured policy splits the funded budget among approved Creators, deducts a 10% platform commission, and releases earnings to test wallets after campaign completion and content approval. Bank transfers are outside the local configuration.

Never enter live payment credentials in a local development environment or commit secrets.

## Files, email and analytics

Creator and campaign files are stored privately in MySQL during local development. Access is checked against the owning account or campaign allocation. Images are normalized; PDFs are restricted and validated. Production deployments should use dedicated object storage with access controls, retention and backups.

Notifications are persisted in the application. Email delivery uses an outbox and requires SMTP configuration. Social metrics and post URLs are manually supplied; OAuth connections and automatic platform insights are not configured. Analytics use recorded application and financial data and do not fabricate social performance.

## Database change management

SQL schema updates are numbered migration files under `backend/migrations/`. The migration runner records checksums and rejects edits to applied migrations. Add a new migration for schema changes. Stored procedures are maintained under `backend/stored-procedures/` and installed by the database setup process.

For local commands, secrets and account provisioning, see [Getting Started](GETTING_STARTED.md). For backups, monitoring, proxy configuration and release planning, see [Deployment and Operations](DEPLOYMENT_OPERATIONS.md).
