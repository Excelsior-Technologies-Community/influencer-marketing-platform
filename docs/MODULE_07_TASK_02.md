# Module 07 Task 2 — Creator Applications and Withdrawal

Completed: saved-data eligibility checks, pitch submission, duplicate prevention, withdrawal, owned application list/detail/status/history, and MySQL persistence. Task 3 Brand decisions/slot allocation is complete; see MODULE_07_TASK_03.md. Task 4 workspaces are complete; see MODULE_07_TASK_04.md.

## Setup and checking

1. Retain existing MySQL credentials in ignored `backend/.env`. Run `npm.cmd run db:migrate` and `npm.cmd run db:verify`. Files 028–029 add two tables, an eligibility view and application procedures; applied files remain unchanged. Verification covers 28 tables, two views and 29 tracked SQL files.
2. Reuse existing development servers or run `npm.cmd run dev` once when stopped.
3. Sign in as Creator → Discover campaigns → View campaign. The application panel shows each requirement and links to profile, social accounts or verification files for missing items.
4. Complete profile bio/location/languages/categories and a matching social account. Identity verification must be VERIFIED through the existing Super Admin verification workflow. Refresh eligibility.
5. Enter a pitch of 20–2000 characters describing your content approach and fit. Submit application. The saved application opens with PENDING status, the pitch, timestamp and history. Application submission does not reserve a slot or guarantee acceptance.
6. Open My applications to search by campaign/Brand and filter status. Open details; reload to confirm persistence. Tracking remains accessible even when discovery hides the campaign.
7. To withdraw PENDING/SHORTLISTED, enter a reason of 10–500 characters, choose Withdraw application, then confirm. WITHDRAWN and its reason/history persist. Withdrawal is final: one application per campaign/Creator for its lifetime, and withdrawn applications cannot be resubmitted. The warning appears before confirmation.

## Eligibility policy

- Current campaign must pass the shared discoverability rules: LIVE, active Brand, application opening reached, deadline and start in the future, valid saved campaign details/catalog choices/schedule/brief.
- Creator account must be active and its identity verification VERIFIED.
- Bio and location must be nonempty and at least one saved language must exist.
- At least one active Creator category must match a campaign category exactly or through a direct parent/child relationship. Creator category parents must remain active. Siblings do not automatically match.
- At least one saved social account must use an active campaign platform. Accounts and metrics remain self-reported; this check does not verify ownership or audience figures.
- No prior application may exist for the campaign/Creator pair.

No follower, skill, portfolio, fee or engagement threshold is inferred from free-text campaign requirements. Brands review campaign-specific requirements in Task 3. Eligibility shown on screen is advisory; submission repeats all checks in the write transaction. Changes to verification/profile/social/category/campaign status or deadlines cannot be bypassed by an earlier eligible response.

Withdrawal requires an active owning Creator, current application revision and PENDING/SHORTLISTED status. It remains possible after campaign closure/cancellation or eligibility changes because it does not award/release an approved slot. APPROVED, REJECTED and WITHDRAWN cannot withdraw here. Task 3 will implement Brand decisions and atomic approved-slot allocation; Task 2 never fabricates those outcomes. Campaign and application statuses are shown separately.

## MySQL and access protection

`campaign_applications` has a UUID ID, unique `(campaign_id, creator_id)`, pitch/status/revision/timestamps and restrictive foreign keys. `campaign_application_history` retains submission/withdrawal events, reason and revision. No editing or application-deletion endpoint exists. Used campaign deletion explicitly rejects application dependencies as well as existing review/lifecycle history.

Submit serializes the shared role, active user, Creator and campaign locks. Withdrawal acquires the campaign then application under the same shared guard. Duplicate/stale/concurrent requests cannot create two applications or increment withdrawal twice. Application, history and safe audit writes commit atomically. Audit metadata excludes pitch and withdrawal text. Actor/Creator/status IDs cannot be supplied by clients. Owner-only tracking omits other applicants, Brand contacts/billing and Creator identity evidence. Read responses are no-store. Mutations use existing Origin and X-Requested-With protection.

History is the application's status history and saved pitch, not a historical snapshot of campaign/profile contents. Current campaign title/company/status accompany it. Task 3 cancellation now rejects pending/shortlisted applications with generic feedback while retaining approved allocations/history. Manual application withdrawal remains available for undecided applications on other closed campaigns.

## API

Prefix `/api/v1`; active CREATOR Bearer authentication is required. POST also requires `X-Requested-With: InfluenceWeb` and an allowed Origin when provided.

| Method | Route | Body/purpose |
| --- | --- | --- |
| GET | `/creator/campaigns/:id/application-eligibility` | Checks, canApply, existing application summary and guidance |
| POST | `/creator/campaigns/:id/applications` | `{pitch}`; returns 201 with saved application/history |
| GET | `/creator/applications` | Owned list with optional status, literal title/Brand q, page, pageSize ≤50 |
| GET | `/creator/applications/:id` | Owned pitch, status/revision, current campaign summary, history, canWithdraw |
| POST | `/creator/applications/:id/withdraw` | `{revision, reason}`; revision is a JSON number |

Application status filters: PENDING, SHORTLISTED, APPROVED, REJECTED, WITHDRAWN. Only PENDING and WITHDRAWN are produced by Task 2. Unknown fields, invalid UUIDs and invalid lengths return 422; missing/foreign records or hidden campaigns 404; duplicate/stale/forbidden transitions 409; missing eligibility 422. Swagger 0.7.2 and Postman document all five routes and current revisions.

## Verification

All 16 suites / 181 tests passed. Twelve new actual-MySQL checks cover unmet/ready/stale eligibility, category hierarchy, concurrent duplicate submission, ownership/RBAC, closed/paused deadlines, concurrent withdrawal, lifetime uniqueness, permitted source statuses, filters/pagination, used-record deletion protection, strict fields/origin/suspension and safe audits. Production build passed with 107 modules. Database verification and immutable migration rerun passed.

Browser with synthetic fixtures: unmet checks blocked applying; profile/social saves and an admin verification decision enabled the form. Submitted pitch opened PENDING, survived reload and prevented duplicate form submission. My applications status filter found it. Withdrawal confirmation produced WITHDRAWN with retained pitch/reason/history after reload. Output screenshots were visually inspected:

- `.local/screenshots/module-7-task-2-application-submitted.jpg`
- `.local/screenshots/module-7-task-2-application-withdrawn.jpg`

Signed out and removed only temporary applications/history/audits, Creator/Brand/admin fixtures, owned campaign/planning/files and the category created for verification. Existing user records and the pre-existing development servers were retained.
