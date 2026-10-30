# Module 12 Task 1 — End-to-end workflow verification

## What this task verifies

Verify that the completed local workflows work together with MySQL and enforce their role and campaign ownership boundaries. The primary path is Brand campaign setup and submission, Super Admin approval, Creator discovery and application, Brand allocation, Creator content submission, Brand approval and campaign completion. Payment funding, wallet accounting, Creator release and refund handling are verified as separate Test Mode workflows because provider credentials and external payment events are environment-specific.

## Verification performed

- `npm run build` — frontend production build succeeded.
- `npm run db:verify` — connected to the configured MySQL database; checked the roles, required tables, all tracked SQL files, baseline catalogs, stored procedure/repository call, uniqueness and foreign-key protections, rollback behavior and API readiness. No verification account was retained.
- Automated disposable-MySQL end-to-end API workflow — Brand campaign setup and submission, Super Admin approval, Creator discovery/application, Brand allocation, Creator content submission, Brand approval and completion, notification creation, and cross-role access denial.
- Disposable-MySQL financial suites — campaign funding, wallet ledger, Creator earnings release, refunds and refund gateway transport.
- Combined focused run: 6 suites and 50 tests passed. The suites create and drop isolated schemas and use synthetic provider data where applicable; they do not issue real payments.

## Optional browser walkthrough

1. Start the backend and frontend, then sign in as a Brand. Create a campaign, fill its requirements, budget, deliverables and schedule, add a brief, and submit it for approval.
2. Sign in as Super Admin. Review and approve the campaign.
3. Sign in as a Creator. Find the published campaign and apply.
4. Return to the Brand account and approve the Creator application. Confirm the allocated campaign appears in the Brand and Creator workspaces.
5. Sign in as the Creator and submit the required published content.
6. Sign in as the Brand and approve every required content item, then complete the campaign.
7. Confirm the completed campaign is visible to its Brand and allocated Creator, and that unauthorized accounts cannot access its private workspace or content.
8. Use the Module 09 Test Mode steps to fund and release earnings; confirm the Creator wallet and Brand/Creator payment histories. Do not use live payment credentials for this local verification.

Use the module-specific setup guides linked from [MODULES.md](MODULES.md) for exact UI steps and prerequisites. The API workflow above is automated in `backend/tests/full-workflow.integration.test.js`.

## Scope and limitations

The automated check exercises the actual API and MySQL workflow without a browser. SMTP delivery, external webhook delivery, bank transfers and production deployment are not implied by local checks. Campaign post reach and engagement still require an authorized external measurement source.
