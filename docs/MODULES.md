# Module-wise implementation roadmap

Source: all 19 pages of the supplied project documentation. Its 31 sections describe requirements, architecture, and delivery; the following 12 modules put those requirements in dependency order. Optional features are separate from the core build.

## 01. Foundation - complete

React/Vite frontend, Node/Express API, MySQL configuration, database migration runner, parameterized stored-procedure repository, standard responses, safe errors, logging, CORS, Helmet, rate limits, Swagger and Postman. Initial identity, profile, token, catalog and audit tables. Runnable module roadmap and three informational role previews.

Implemented API: `GET /api/v1/health`, `GET /api/v1/health/ready`. OpenAPI: `/api-docs/openapi.json`; Swagger: `/api-docs/`.

Completion gate: dependency install, tests and frontend build pass; MySQL migrations and `sp_get_roles` verified against a configured project database. All gates passed: 13 MySQL tables, 9 tracked SQL files, catalog procedure, unique/FK constraints, rollback and API readiness verified.

## 02. Authentication, authorization and account security - complete

Full MySQL-backed authentication APIs, session rotation/replay protection, password recovery, RBAC/ownership and protected frontend pages are implemented. See [Module 02 usage and checks](MODULE_02_SETUP.md). SMTP can be configured for inbox delivery; local development uses a private mail folder.

Brand/creator registration with transactional profile creation; controlled super-admin provisioning; bcrypt passwords; login; short-lived JWT access tokens; refresh rotation, expiry and reuse detection; logout; email-backed forgot/reset password. Current-user endpoint, role routes, ProtectedRoute/RoleRoute, server RBAC and object ownership. Account suspension immediately blocks protected operations. Public registration must never accept SUPER_ADMIN.

API: the six `/auth/*` endpoints from PDF section 18, plus `/auth/me`. Procedures: `sp_create_user`, `sp_user_login` (returns internal credentials only to the auth service), `sp_get_user_by_id`, `sp_update_user`, `sp_change_password`, and session/reset operations.

Completion gate: all three roles, credential validation, token replay, logout/reset invalidation and cross-account access tested. No passwords/hashes/tokens in normal responses or logs.

## 03. Super Admin and reference catalogs - complete

Brand/creator search and detail views, account status changes, verification, category/subcategory management, platforms and content types, audit trail. Dashboard starts with actual identity/catalog data; campaign/payment widgets arrive with their modules.

Completed: protected overview, search/filter/pagination/detail screens, account status/session revocation, verification transitions, category/subcategory/platform/content-type management and audit history. See [Module 03 checks](MODULE_03_SETUP.md). APIs and stored procedures enforce roles, transactional changes and category hierarchy under concurrency; account status lives in users.

## 04. Brand profile and workspace - complete

Company details, logo, website, industry, description, location, social links and billing profile; brand layout and ownership-protected reads/updates. Brand dashboard is expanded as workflow data becomes available.

Completed: private dashboard/profile/billing screens, validated logo upload/replace/remove, ownership checks, transactional saves and stale-edit protection. See [Module 04 usage and checks](MODULE_04_SETUP.md). APIs: `/brand/profile`, `/brand/dashboard`, `/brand/profile/logo`. Base brand creation is part of Module 02 registration. Campaign listing procedures arrive with Module 06.

## 05. Creator profile, social accounts and portfolio - complete (core local workflow)

Tasks 1–4 complete: editable profile, manual social accounts, private photo/portfolio/verification uploads, Super Admin evidence access and a Creator dashboard with real completeness, saved metrics, portfolio and verification status. MySQL persistence, validation, ownership, stale-edit protection and combined workflow checks are implemented. See [Task 1](MODULE_05_TASK_01.md), [Task 2](MODULE_05_TASK_02.md), [Task 3](MODULE_05_TASK_03.md) and [Task 4 checks](MODULE_05_TASK_04.md). Provider OAuth/sync and cloud adapters need separate configuration; local private storage uses MySQL. Later campaign/payment/analytics modules expand the dashboard with their actual data.

Photo, bio, location, languages, categories, skills, portfolio and verification documents. Social platform, username, URL and permitted metrics; encrypt provider tokens. Manual metrics are explicitly distinguished from verified provider data. OAuth/synchronization require provider configuration.

API: `/creator/profile`, `/creator/dashboard`, social/portfolio endpoints. Procedures: creator CRUD and social-account operations. Shared upload support: size, MIME and extension checks, generated keys, ownership, private evidence URLs and file metadata. Cloudinary/S3 adapter.

## 06. Campaign management and approval - complete

Tasks 1–4 complete: private Brand drafts, exact decimal planning budget/currency, slots, requirements, catalog selections/deliverables, private briefs/references, validated UTC schedules and saved-data preparation checks. Includes ownership, independent revisions, upload quotas and concurrency protection. See [Task 1](MODULE_06_TASK_01.md) and [Task 2 setup/checks](MODULE_06_TASK_02.md). [Task 3](MODULE_06_TASK_03.md) adds Brand submission, Super Admin review/approve/reject, return-to-draft/resubmission and review history. [Task 4](MODULE_06_TASK_04.md) adds publish/pause/resume/cancel, automatic schedule expiry/closure/start, combined history, title/status filters and unused-draft deletion. Local Module 06 is complete; discovery/applications, content review/completion and financial workflows remain in their later modules.

Brand campaign CRUD, brief/reference files, platforms/content types, categories, deliverables, budgets, slots, requirements, valid schedules, approval/rejection, publish/pause/resume/cancel and lifecycle history. Approved state and schedule are required before LIVE.

API: brand campaign endpoints from PDF section 18; admin campaign review/actions. Procedures include `sp_save_campaign_draft`, `sp_get_campaign`, `sp_list_campaign_management`, `sp_campaign_review_transition`, `sp_delete_campaign`, `sp_change_campaign_status`, `sp_refresh_campaign_status` and `sp_get_campaign_lifecycle`.

Completion gate: every permitted transition and invalid date/budget combination tested; ownership enforced. Deletion restricted to unused drafts; history-bearing records retained.

## 07. Discovery, applications and atomic slot allocation - complete

Task 1 complete: Creator live-campaign discovery, combined filters, paginated results, details and authenticated brief/reference access under shared current visibility rules. See [Task 1 usage/checks](MODULE_07_TASK_01.md). Task 2 eligibility/apply/withdraw and owned application tracking/history is complete; see [Task 2](MODULE_07_TASK_02.md). Task 3 Brand applicant decisions, safe profile/portfolio review, transactional slot allocation and cancellation integration are complete; see [Task 3](MODULE_07_TASK_03.md). Task 4 allocation-scoped Brand/Creator workspaces, private brief access, schedules, deliverables, participant history and full workflow checks are complete; see [Task 4](MODULE_07_TASK_04.md).

Creator search/filter/detail, eligibility checks, apply/withdraw, brand applicant list/filter, shortlist/approve/reject, active campaign workspace. Unique campaign/creator constraint prevents duplicates. Approval locks campaign/application rows and allocates the slot in one transaction; simultaneous approvals cannot exceed capacity.

API: creator campaign/application endpoints and brand application decision endpoints. Procedures: `sp_apply_campaign`, `sp_get_campaign_applications`, `sp_approve_application`, `sp_reject_application`, `sp_withdraw_application` plus shortlist/history.

Completion gate: eligibility, deadlines, duplicate apply, ownership and concurrent last-slot approvals tested against MySQL.

## 08. Content submissions, evidence and revisions - complete

Task 1 complete: approved allocated Creators submit published content URL, campaign platform/content type, individual deliverable item, caption, publication time and notes; owned paginated tracking, validation, window gates, duplicate prevention and MySQL audit/retention. See [Task 1 usage/checks](MODULE_08_TASK_01.md). Task 2 private evidence and immutable version history is complete; see [Task 2 usage/checks](MODULE_08_TASK_02.md). Task 3 Brand review/approve/reject/request-revision and Creator-visible feedback are complete; see [Task 3 usage/checks](MODULE_08_TASK_03.md). Task 4 requested-change resubmission, scoped progress and explicit completion are complete; see [Task 4 usage/checks](MODULE_08_TASK_04.md). Module 08 local workflow is complete.

Approved creator submits content URL, platform, caption, published date, evidence and notes. Brand review/approve/reject/request revision; revision reasons required; version history and completion conditions. Multiple deliverables are tracked individually.

API: creator submission endpoints and brand submission review endpoints. Procedures: `sp_submit_content`, `sp_creator_content_submissions`, `sp_brand_review_content`, `sp_resubmit_content`, `sp_content_progress`, `sp_complete_content_campaign`.

Completion gate: unauthorized creator blocked, correct deliverable linkage, approved content immutable except audited workflow, revisions and completion criteria tested.

## 09. Payments, wallet, commission and payouts — complete (selected local Test Mode workflow)

Task 1 local workflow is complete: Razorpay Test Mode + INR campaign principal funding, private attempt history, durable/reused orders, receipt reconciliation and signed verification. Actual Razorpay Test Mode authentication, order creation, checkout/capture and reconciliation passed. External webhook delivery requires deployment configuration. See [Task 1 setup/checks](MODULE_09_TASK_01.md). Task 2 immutable balanced ledger, atomic funding credits, owned wallets and transaction/payment history are complete; see [Task 2](MODULE_09_TASK_02.md). Task 3 is complete: equal funded-principal shares, 10% per-Creator commission and completion/approval-gated Brand release to Creator test wallets with balanced immutable entries and duplicate protection; see [Task 3](MODULE_09_TASK_03.md). Task 4 full cancelled/unreleased-campaign refunds, confirmed reverse ledger entries, signed refund events, failures, ambiguous receipt recovery and manual review for partial/post-release/external exceptions are complete; see [Task 4](MODULE_09_TASK_04.md). External webhook deployment, manual financial exception execution and bank transfers require separate setup.

Sandbox payment gateway, funding, transactions, verified webhook signatures, idempotency keys/event uniqueness, server-side fee calculation, immutable credit/debit ledger, eligible payout, failure/refund history. Use DECIMAL/minor units, never floating-point financial arithmetic. Ledger and business status change transactionally. Reports derive balances from auditable entries.

API: payments/webhooks/payout and creator earnings/history endpoints. Procedures: `sp_create_payment`, `sp_payment_success`, `sp_payment_failed`, `sp_release_creator_payment`, `sp_get_payment_history`, `sp_get_creator_earnings`.

Selected policy: Razorpay Test Mode INR saved campaign budget as principal, equal approved allocated Creator shares, 10% commission deducted per share and explicit Brand release after completion/latest approvals. Whole-paise remainder goes in allocation order; commission rounds down per Creator. No gateway-fee deduction. Test wallets only. Selected Task 4 policy: automatic full refund only after cancellation and before Creator release; partial/post-release exceptions require manual review. Only confirmed processed refunds debit held principal. Pending/uncertain refunds and open reviews block release. No automatic partial/post-release clawbacks or full chargeback-management system.

Completion gate: duplicate/invalid webhook, repeated payout, rollback, refund and correct ledger reconciliation tested in sandbox.

## 10. Reviews, messaging and notifications

Task 1 implemented: completion-gated mutual Brand/Creator campaign reviews, participant and ownership checks, 1–5 ratings with optional comments, one immutable review per participant pair, and author/recipient-only visibility. See [Module 10 Task 1](MODULE_10_TASK_01.md). Task 2 implemented: separate Brand–Creator campaign threads, immutable messages, paginated history, per-recipient read receipts, unread counts, sanitized private attachments and audited downloads. See [Module 10 Task 2](MODULE_10_TASK_02.md). Task 3 implemented: private, paginated in-app notifications for applications, content review, funding, Creator wallet releases, refunds and payment-review cases, with one-way read status. See [Module 10 Task 3](MODULE_10_TASK_03.md). Task 4 implemented: transactional email outbox for in-app events plus 24-hour application, content and campaign-end reminders, with deduplication, leases, bounded retry/backoff and dead-letter status. SMTP delivery requires EMAIL_HOST and EMAIL_FROM in backend/.env. Real-time Socket.IO delivery remains optional.

API: role-scoped campaign review and conversation/message endpoints are implemented. Task 3 adds authenticated own-notification endpoints. Completion gate: participant/ownership protection for reviews, messages and notifications; event notification records are deduplicated and transactionally tied to source updates; email uses an idempotent, retryable outbox and scheduled deadline reminders.

## 11. Analytics, dashboards and reports - complete (local Test Mode workflows)

Task 1 complete: role-specific dashboards now show live MySQL aggregates for Super Admin, Brand and Creator accounts. Brand counts are scoped to its own campaigns/applications; Creator counts are scoped to its own applications/collaborations; Super Admin sees platform-wide campaign/account/catalog summaries and registration trends. Missing activity displays as zero; no performance figures are fabricated. See [Module 11 Task 1](MODULE_11_TASK_01.md).

Task 2 complete: Brand campaign analytics list each owned campaign with application counts, approved creators, required/submitted/approved deliverables, budget, captured Test Mode funding, posted Creator releases, commission, refunds and held balance. The API scopes rows to the authenticated Brand and supports paginated status/title filters. Campaign post-level reach and engagement remain explicitly “not recorded” because no campaign analytics provider or verified campaign metric source is configured; self-reported Creator profile metrics are not reused. See [Module 11 Task 2](MODULE_11_TASK_02.md).

Task 3 complete: Creator analytics show the Creator's own saved self-reported social-account figures and personal session/page activity. Signed-in route visits are normalized and recorded with bounded elapsed time. Super Admin gets aggregate screen/session usage without user identities. Query strings, raw user agents and device fingerprints are not collected. Profile views and campaign post reach remain unavailable until a real measurement source exists. See [Module 11 Task 3](MODULE_11_TASK_03.md).

Task 4 complete: Super Admin, Brand and Creator have role-scoped financial reports based on posted Test Mode ledger events, with date/status/campaign/search filters, bounded pagination and formula-safe CSV exports capped at 5,000 rows. See [Module 11 Task 4](MODULE_11_TASK_04.md). CTR/ROI/conversions and campaign post-level reach remain unavailable until real source data exists; no performance values are fabricated.

Procedures include `sp_track_analytics_event`, `sp_admin_user_screen_analytics`, `sp_brand_campaign_analytics`, `sp_creator_activity_analytics` and `sp_analytics_report`. Module 11 local workflow is complete.

## 12. Full-system verification, documentation and deployment

Task 1 complete: an automated disposable-MySQL end-to-end API workflow verifies Brand campaign preparation/submission, Super Admin approval, Creator discovery/application, Brand allocation, Creator content submission, Brand review/completion, notification creation and role boundaries. Frontend production build, configured-MySQL verification and six focused disposable-database suites (50 tests) passed. See [Module 12 Task 1](MODULE_12_TASK_01.md). Task 2 complete: a focused security/regression pass covers origin/CORS rules, request protections and limits, safe errors, auth inputs/password handling, cross-role access and financial ownership/immutability. Nine suites / 70 tests passed; details and rerun commands are in [Module 12 Task 2](MODULE_12_TASK_02.md). Task 3 complete: the project setup/architecture references were refreshed, a repeatable MySQL-backed ERD generator and schema snapshot were added, and the OpenAPI/Postman metadata were updated. See [Module 12 Task 3](MODULE_12_TASK_03.md). Task 4 complete: the project now includes production configuration preflight, trusted-proxy hop configuration, and a deployment runbook covering release sequence, HTTPS topology, secrets, health, background jobs, backups, restore and rollback. No external production deployment is claimed. See [Module 12 Task 4](MODULE_12_TASK_04.md) and [Deployment and operations](DEPLOYMENT_OPERATIONS.md).

Unit/integration/API/RBAC/security/UI/regression tests, real MySQL/SP checks, end-to-end three-role flow, payment sandbox tests. Complete ERD, migrations, procedures, Swagger/OpenAPI, Postman environments and assertions, setup/deployment/rollback/backups and handover. Development/staging/production isolation, HTTPS and secrets management.

Tests, Swagger, Postman and setup instructions are updated in every module; this final module verifies the complete workflow rather than delaying quality work until the end.

## Optional follow-up modules

Explainable creator recommendations/matching, audience demographics, fraud detection, creator tiers, subscriptions, referrals/coupons, tax/GST invoices, dispute management, advanced ROI/search, social synchronization and AI brief generation. Provider access and business decisions are prerequisites.

## Common definition of done

Intended role works; unauthorized roles/owners blocked; validated inputs and legal state transitions; transactions/SP logic verified; standard responses; updated Swagger/Postman/tests; loading/empty/error UI; audited sensitive actions; no exposed secrets; setup updated.

## PDF interpretation decisions

- Use MySQL as the system of record. The PDF title says MERN but its actual database specification requires MySQL and stored procedures; no MongoDB is introduced.
- One role per account in the initial implementation (the PDF core user example uses role_id). Add permission/multi-role mapping if needed later.
- Financial policy, provider credentials and social API permissions are open decisions, not implementation facts.
- Document content is treated as product requirements, not authorization to deploy, publish or send messages.
