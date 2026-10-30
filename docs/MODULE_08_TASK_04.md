# Module 08 Task 4 — Revision responses and campaign completion

Completed locally on 23 October 2026. Modules 08 Tasks 1–4 are complete. Payment processing remains Module 09.

## Check in the app

1. Sign in as the owning Brand. Open **My campaigns → Open workspace → Review content**. Request a revision on a submitted item before the content deadline and enter a reason.
2. Sign in as that allocated Creator. Open **My campaigns → Open workspace → Content submissions → Evidence & version history**. Select the latest version, read Brand feedback, update content details and enter a response reason of 10–500 characters. Choose **Review resubmission → Confirm new version**.
3. The new head is SUBMITTED with a RESUBMIT snapshot. Earlier content, private evidence and feedback remain available through the version selector. Existing evidence carries forward; use normal evidence upload/removal to make further saved versions while awaiting review.
4. As Brand, inspect and approve the latest version. Approve every required unit for every allocated Creator. The workspace shows **approved / required items** and **allocated / required Creator slots**. Creator progress shows only that Creator's own items.
5. When every Creator slot is allocated and every required item has a latest-version approval, enter a completion reason in the Brand workspace. Choose **Complete campaign → Confirm completion**. Status becomes COMPLETED; history and authorized private downloads remain readable.

For example, two required reels for each of three Creator slots require three approved allocations and six separately approved items. Five approvals, an unfilled slot, pending review, a rejected item or requested revision blocks completion. A different required platform/content type must also be completed.

## Workflow rules

- Resubmission requires the current expected version and its recorded REQUEST_REVISION decision. Approved/rejected content cannot be reopened. Foreign/inactive users, cancelled/closed campaigns and expired content windows cannot resubmit.
- Existing details may be retained when the response reason explains the requested change; evidence updates then use the ordinary versioned workflow. Every later Brand decision applies to the exact latest saved version, so an intervening evidence change invalidates a stale decision request.
- All versions, earlier evidence and review reasons remain retained. The existing 50-version, five-current-file, 5 MiB upload and 25 MiB retained-storage limits apply. A request at version 49 may create version 50; no further revision can then be requested.
- Completion is explicit. Time passing or individual approval does not complete the campaign. Brand can finish reviews and complete after deadlines; Creator resubmission still closes at the content deadline.
- Completion checks the current campaign revision and actual latest-version review proof inside the same transaction as the lifecycle event. Duplicate completion and competing cancellation cannot create two transitions. Content and reason text are excluded from audit metadata.
- Completion closes content writes and records one COMPLETE lifecycle entry plus CAMPAIGN_COMPLETE audit. It does not issue payment.

## API and database

All paths below are under `/api/v1`; use the relevant role's Bearer token. POST requests require `X-Requested-With: InfluenceWeb` and an allowed Origin when supplied.

| Method | Path | Body / result |
| --- | --- | --- |
| POST | `/creator/workspaces/:id/submissions/:submissionId/resubmit` | `{version,contentUrl,caption,publishedAt,notes,reason}` → 201 with retained history |
| GET | `/creator/workspaces/:id/progress` | Own `requiredItems`, `approvedItems`, status/revision; `canComplete:false` |
| GET | `/brand/workspaces/:id/progress` | Campaign totals, Creator slot coverage, `canComplete` and current campaign `revision` |
| POST | `/brand/workspaces/:id/complete` | `{revision,reason}` → 200 with COMPLETED progress |

New append-only SQL files: `042_content_resubmission_completion.sql` and `043_creator_resubmission_history.sql`. Existing applied files are unchanged. Database verification checks the new `campaign_content_progress` view and all 43 tracked SQL files. Procedures: `sp_resubmit_content`, `sp_content_progress`, `sp_complete_content_campaign`; Creator history now returns `canResubmit`.

Swagger is version 0.8.4. Postman includes a Task 4 folder with the four requests; select the appropriate role token and copy the latest content/campaign revision before writes.

## Verification

- 22 test suites, 253 tests passed across the regression run and three added boundary checks. Task 4 contributes 14 real-MySQL integration tests.
- Tests cover submit → review → revise → evidence version → approve → complete; original file retention; missing/rejected/requested units; multiple Creators and content types; exact latest-version proof; strict inputs; ownership/origin/inactive accounts; deadline and version limits; transaction rollback; competing resubmissions; duplicate completion and completion versus cancellation.
- Production frontend build passed (116 modules). The bundler reports the existing advisory about a JavaScript chunk above 500 kB.
- MySQL verification passed with 43 tracked SQL files, foreign keys, rollback and API readiness.
- Browser check with synthetic accounts: Creator resubmitted version 2 as version 3, retained proof/feedback, Brand approved version 3, workspace showed 2/2 approved and 1/1 slots, and confirmation changed the campaign to COMPLETED.
- Screenshots: `.local/screenshots/module-8-task-4-resubmission.png` and `.local/screenshots/module-8-task-4-completed.png`. Demonstration accounts/campaign were removed afterwards; existing development servers were reused.
