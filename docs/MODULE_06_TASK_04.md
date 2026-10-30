# Module 06 Task 4 — Campaign Lifecycle and Management

Completed: approved campaign publication, pause/resume, cancellation, automatic schedule transitions, combined status history, Brand title/status filters, administrative cancellation and safe unused-draft deletion. Module 06 local campaign management is complete. Creator discovery/applications, content evidence/reviews, payments and analytics are implemented in their later modules.

## Setup and usage

1. Keep existing MySQL credentials in ignored `backend/.env`. Run `npm.cmd run db:migrate`, then `npm.cmd run db:verify` (26 required tables, 25 tracked SQL files). Existing applied migrations remain unchanged; new files are 024–025.
2. Reuse running development servers. Otherwise start the project with `npm.cmd run dev`. The API starts its campaign clock after it successfully listens, checks due rows immediately and every 60 seconds, and stops the clock during shutdown. Maximum 100 due campaigns per batch; overlapping ticks in one process are skipped, and shared MySQL locks make multiple server processes safe.
3. Brand Admin → **Campaigns**. Search by a literal title substring and/or choose a status. Filters reset pagination. Open **Manage** beside a campaign, or **Manage campaign** from its editor or approval review.
4. Complete the Task 3 approval workflow. Open Manage for an APPROVED campaign, enter a reason of 10–1000 characters, choose **Publish campaign**, then confirm. Publication is allowed only during its application window, with future deadline/start and all saved readiness requirements still valid.
5. A LIVE campaign can be paused and a PAUSED campaign resumed, each with a reason and confirmation. Pausing does not change dates. Resume revalidates readiness; expired deadlines cannot be bypassed.
6. Cancel a nonterminal campaign with a reason and confirmation. Cancellation is final and retains details, files and all history. Super Admin can also cancel through review → **Manage campaign**; publishing/pause/resume remain the owning Brand's actions.
7. Choose **Refresh schedule status** to apply due changes immediately. **Reload campaign** just reads saved state. The API clock uses database UTC time, including catching up after downtime. Browser controls display local time.
8. An unused DRAFT with no review or lifecycle history shows **Delete unused draft**. The confirmation explains permanent removal of its private files/schedule/deliverables. Revision and ownership are rechecked atomically. A rejected campaign returned to draft has history and cannot be deleted. An audit record remains for successful deletion.

## Transition policy

| Trigger | From | To | Gate |
| --- | --- | --- | --- |
| Brand publish | APPROVED | LIVE | applications open ≤ now < application deadline; future start; all readiness checks |
| Brand pause | LIVE | PAUSED | Application deadline has not passed |
| Brand resume | PAUSED | LIVE | Readiness and future application deadline/start rechecked |
| Brand/admin cancel | DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, LIVE, PAUSED, APPLICATION_CLOSED, IN_PROGRESS | CANCELLED | Latest revision and reason |
| Schedule | APPROVED | EXPIRED | Unpublished approval reaches application deadline or start |
| Schedule | LIVE or PAUSED | APPLICATION_CLOSED | Application deadline reached |
| Schedule | APPLICATION_CLOSED | IN_PROGRESS | Campaign start reached |
| Brand deletion | Unused DRAFT | Removed | No review/lifecycle history; latest revision |

The existing submission/review graph remains DRAFT → PENDING_APPROVAL → APPROVED/REJECTED and REJECTED → DRAFT for corrections. Cancelled, expired and completed campaigns cannot be reopened by lifecycle actions. Clients cannot choose arbitrary statuses or supply a clock value.

If both application deadline and start passed during downtime, catch-up records APPLICATION_CLOSED and IN_PROGRESS separately, incrementing revision for each. System transitions have a null actor and are labelled **System schedule**. Repeated refreshes have no duplicate events. Drafts and pending reviews do not auto-expire. Published campaigns are not marked completed merely because their end date passed: content evidence and completion/payment conditions belong to later modules.

Current cancellation records campaign status and history. Later application/payment modules must extend cancellation policy to resolve their own dependent records and financial outcomes; this module does not simulate refunds, creator awards or content approvals. Future foreign keys and explicit dependency checks must retain history-bearing/used records.

## Persistence, security and concurrency

`campaign_lifecycle_history` stores action, actor (nullable for schedule), before/after status, reason, revision and timestamp. Management history combines it with approval history ordered by campaign revision. History is append-only through the API. Stored procedures bind all parameters. User, catalog, campaign, schedule/file, approval and lifecycle writes use the same shared role lock plus campaign locks. Latest campaign revision is required for user actions and deletion. Transactions include safe audit writes; audit metadata omits reason text, private files and campaign contents.

The owning active Brand has full management access. An active Super Admin can read lifecycle metadata/history, refresh schedules and cancel; admin review file/details remain subject to the submitted/history-bearing access rule. Creator/other-Brand access is denied. Schedule refresh always uses server database time and cannot be used to alter another Brand's records. Automated scheduling is an internal process, not an unauthenticated HTTP route.

Deletion cascades planning links, deliverables, schedule and private blobs only for an unused draft. Used/history-bearing records remain. Deletion and submission serialize under the same locks, so a successfully submitted draft cannot also be deleted.

## API

Prefix: `/api/v1`. All routes require Bearer authentication. Mutations require `X-Requested-With: InfluenceWeb` and an allowed Origin when supplied.

| Method | Route | Body/purpose |
| --- | --- | --- |
| GET | `/brand/campaigns?status=LIVE&q=launch&page=1&pageSize=10` | Own campaign list; status optional; literal title query ≤100 characters; page size ≤50 |
| GET | `/brand/campaigns/:id/lifecycle` | Campaign/revision/schedule/serverTime/canDelete, available actions, combined history |
| POST | `/brand/campaigns/:id/lifecycle/actions` | `{action: "PUBLISH"/"PAUSE"/"RESUME"/"CANCEL", revision, reason}` |
| POST | `/brand/campaigns/:id/lifecycle/refresh` | `{}`; applies due schedule changes |
| DELETE | `/brand/campaigns/:id` | `{revision}`; unused draft only |
| GET | `/admin/campaign-management/:id` | Lifecycle metadata/history |
| POST | `/admin/campaign-management/:id/actions` | `{action: "CANCEL", revision, reason}` |
| POST | `/admin/campaign-management/:id/refresh` | `{}` |

The admin review queue also accepts all documented campaign status filters. Postman and Swagger version 0.6.4 include these endpoints. To run one bounded schedule catch-up manually, use `npm.cmd run campaigns:refresh -w backend`. That command uses the configured local database, not a separate service.

## Verification

Actual-MySQL lifecycle tests cover every invalid manual source/action pair; publish opening/readiness/budget gates; pause/resume, competing/stale actions, cancellation from all documented sources, terminal locks, scheduled expiry/closure/start and idempotent catch-up, elapsed/inactive resume rejection, cascade deletion and delete-vs-submit concurrency, history retention, roles/ownership/admin cancellation, literal filters/pagination, strict fields/origin/suspension, and safe audits. All 14 suites / 159 tests passed; production build passed (102 modules). Browser publish/pause/resume/reload/cancel, title/status filters, unused-draft deletion confirmation/cancellation and automatic startup expiry passed. See VERIFICATION.md for details. Screenshot: .local/screenshots/module-6-task-4-campaign-lifecycle.jpg. Synthetic fixtures were removed; verification servers stopped afterward.
