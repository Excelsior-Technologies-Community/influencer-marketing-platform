# Module 06 Task 3 — Campaign Submission and Super Admin Approval

Completed: Brand submission, Super Admin review queue/details and private file downloads, approve/reject with reasons, rejected-campaign corrections/resubmission, and persistent review history. MySQL is used throughout. Publishing/lifecycle management is complete in Task 4; see MODULE_06_TASK_04.md.

## Setup

1. Keep the existing MySQL credentials in ignored `backend/.env`.
2. Run `npm.cmd run db:migrate`, then `npm.cmd run db:verify`. Previously applied SQL files remain unchanged. The review feature adds migration 021 and procedures 022–023.
3. Reuse the existing development servers. Start `npm.cmd run dev` only if they are not already running.

## Check the workflow

1. Sign in as Brand Admin → **Campaigns** → open a saved draft → **Open approval review**.
2. Review the saved description, budget/currency, slots, requirements, platforms, categories, content types, deliverables, five dates and brief. Use **Check schedule & files** to complete preparation. Save all edits before submitting.
3. Choose **Submit for approval**, then **Confirm action**. The campaign becomes PENDING_APPROVAL. Campaign content, schedule and files are locked for changes.
4. Sign in using an existing active Super Admin account → **Campaign reviews**. The default queue shows pending campaigns; choose another status to see previous reviews or returned drafts.
5. Open a review, inspect all saved details and download the private brief/reference files. Enter a decision reason of 10–1000 characters. Choose **Approve campaign** or **Reject campaign**, then confirm.
6. For rejection, the Brand sees feedback in **Review history**. Choose **Return to draft**, confirm, save corrections and submit again. Earlier decisions/reasons remain visible.
7. Approval sets APPROVED and records the actor, reason, status change, timestamp and campaign revision. It does not publish or start the campaign. Reload and verify the result.

The Brand campaign list now includes all owned statuses, so submitted and decided campaigns remain accessible. Other Brands cannot read or change them. Unsubmitted drafts are excluded from Super Admin review access; previously submitted drafts remain reviewable after return for corrections.

## Validation and concurrency

Submission and approval recheck saved data inside the MySQL transition transaction: nonempty description and requirements, positive budget and supported currency, valid creator slots, nonempty active platform/category/content-type selections (including category parents), coherent deliverables, one brief, all five dates in order, and future application deadline/start. Brand owner must be active. Application opening can already have occurred. Rejection can resolve a pending campaign whose Brand is inactive.

Shared role and campaign locks serialize submission/decisions with existing campaign, file, schedule, catalog and account-status operations. Content revision is required for every transition; submission also requires the loaded schedule revision. Stale/duplicate actions return 409. Incomplete/expired/unavailable campaign data returns 422. The readiness panel is advisory; transitions independently enforce these checks. Files used at submission are the current saved files under the same lock.

Permitted transitions:

| Actor | From | Action | To |
| --- | --- | --- | --- |
| Owning active Brand | DRAFT | Submit | PENDING_APPROVAL |
| Active Super Admin | PENDING_APPROVAL | Approve | APPROVED |
| Active Super Admin | PENDING_APPROVAL | Reject with feedback | REJECTED |
| Owning active Brand | REJECTED | Return for corrections | DRAFT |

No client can set status, owner or actor directly. Pending/approved/rejected campaigns cannot use draft mutation endpoints. Decisions and history/audit writes commit or roll back together. Safe audit metadata contains states/revision, excluding decision text, campaign contents and file bytes. Private admin downloads are audited, sandboxed, no-store and use generated filenames.

Review history records decisions and reasons, rather than historical copies of campaign contents/files. After a rejected campaign returns to draft, review details and downloads show its current saved version. No review-history editing/deletion endpoint exists. Task 4 retains history-bearing records and limits deletion to unused drafts.

## API

All paths below have the `/api/v1` prefix. Use Bearer authentication; POST also requires `X-Requested-With: InfluenceWeb` and an allowed Origin when supplied. Numeric revision values must be JSON numbers.

| Method | Path | Purpose/body |
| --- | --- | --- |
| GET | `/brand/campaigns/:id/review` | Saved owned details, files metadata and history |
| POST | `/brand/campaigns/:id/submit` | `{revision, scheduleRevision}` |
| POST | `/brand/campaigns/:id/revise` | `{revision}` |
| GET | `/admin/campaign-reviews` | Optional status, page, pageSize (max 50); default all submitted/history-bearing records |
| GET | `/admin/campaign-reviews/:id` | Review details, schedule, files metadata and history |
| POST | `/admin/campaign-reviews/:id/decision` | `{revision, decision: "APPROVE" or "REJECT", reason}` |
| GET | `/admin/campaign-reviews/:id/files/:fileId` | Audited private file download |

Swagger and the Postman Campaign approval folder document these operations. Refresh review details to obtain latest revisions before each action. In Postman, use the appropriate Brand/admin token and re-read details after a successful transition.

## Verification

147 tests across 13 suites pass, including eight new actual-MySQL approval workflow tests: incomplete/stale submissions, inactive catalogs, expired dates, inactive owner/admin, ownership/RBAC, private downloads, strict input/origin checks, parallel submission and competing decisions, rejection/return/resubmission, and safe audits. Production build passes with 100 modules. Database verification checks 25 required tables and 23 tracked SQL files.

Browser verification used synthetic accounts and campaign data: submit → reject → return to draft → save corrected requirements → resubmit → approve → reload persisted history, plus private admin brief download. Screenshot: `.local/screenshots/module-6-task-3-campaign-approval.jpg`. Temporary fixtures are removed after verification; existing records and running development servers are retained.
