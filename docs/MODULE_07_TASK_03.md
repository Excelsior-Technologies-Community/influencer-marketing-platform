# Module 07 Task 3 — Brand Applicant Management

Completed on 22 October 2026: applicant search/filter/pagination, safe Creator profile and portfolio review, shortlist/approve/reject with Creator-visible reasons, transactional slot allocation, history and cancellation integration. Module 07 Task 4 workspaces are complete; see MODULE_07_TASK_04.md.

## Setup and checking

1. Keep the existing MySQL configuration in ignored `backend/.env`. Run `npm.cmd run db:migrate`, then `npm.cmd run db:verify`. SQL files 030–031 add the allocation table, review-window view and applicant procedures. Verification now checks 29 tables, three views and 31 tracked SQL files. Previously applied SQL files remain unchanged.
2. Run `npm.cmd run dev` once when the servers are stopped. Open http://localhost:5173 and sign in as the Brand owning the campaign.
3. Open Campaigns → Applicants beside a campaign, or Manage campaign → Review applicants. Search by Creator name/location and filter application status. Capacity shows allocated and remaining Creator slots.
4. Open Review applicant to see the saved pitch, current profile, categories, social accounts, photo/portfolio and history. Social accounts and metrics are self-reported. Verification documents, private contact information and billing data are excluded.
5. Enter a reason of 10–500 characters, choose Shortlist, Approve or Reject, then confirm. The confirmation explains that the Creator can read the reason. Reload to check saved status, history and capacity. Shortlisting reserves no slot. Approval reserves exactly one slot and may fail if another reviewer takes the last available slot first.
6. Sign in as that Creator → My applications → View application. The decision and reason appear in application history. Approved/rejected applications have no withdrawal action.

## Decision policy

| Current application | Available decisions |
| --- | --- |
| PENDING | SHORTLIST, APPROVE, REJECT |
| SHORTLISTED | APPROVE, REJECT |
| APPROVED, REJECTED, WITHDRAWN | None |

Shortlist/approve require a currently valid published campaign in LIVE, PAUSED or APPLICATION_CLOSED state, an active owning Brand and a future campaign start. The application deadline can have passed. Current Creator activity, verified identity, basic profile, matching active category and social platform are checked again inside the transaction. Invalid catalog/schedule/brief data closes the review window.

Rejection remains available for undecided applications after the review window closes or Creator eligibility changes. Terminal decisions cannot be reversed through these endpoints. Every decision uses the application revision to reject stale edits; it does not change the campaign revision.

Approval writes application status, a unique allocation, history and audit together under the campaign lock. Competing approvals cannot exceed capacity, and approval versus withdrawal has only one winner. Existing approved applications also count toward capacity defensively. This is Creator slot allocation; it does not create a payment or contract.

Cancelling a campaign rejects pending/shortlisted applications in the same transaction with generic cancellation feedback. Private campaign cancellation reasons are not shared with applicants. Approved applications and allocations remain as history. Automatic schedule expiry does not decide applications; the Brand can still reject undecided applications.

## API

All paths are relative to `/api/v1`. Active owning BRAND_ADMIN only. Authentication uses the existing bearer token; decision writes also require the configured origin protection and `X-Requested-With: InfluenceWeb`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/brand/campaigns/:id/applicants` | List, literal name/location search, status filter and capacity |
| GET | `/brand/campaigns/:id/applicants/:applicationId` | Safe profile, pitch, history and currently available actions |
| POST | `/brand/campaigns/:id/applicants/:applicationId/decision` | `{decision, revision, reason}` |
| GET | `/brand/campaigns/:id/applicants/:applicationId/files/:fileId` | Audited photo/portfolio download |

List supports `q` (up to 100 characters), all five application statuses, `page` and `pageSize` (1–50). Portfolio downloads enforce campaign/application/Creator/file association, return private sandboxed attachments and reject verification evidence. Swagger 0.7.3 and the Postman collection include these endpoints.

## Verification

- All 17 actual-MySQL Jest/Supertest suites and 193 tests passed, including 12 new applicant-management tests.
- Coverage includes ownership/roles, safe profile/file access, search/pagination, stale/terminal decisions, eligibility changes, review windows, last-slot concurrency, approval versus withdrawal/cancellation and transactional cancellation feedback.
- Production frontend build passed. Database verification and unchanged migration rerun passed.
- Browser: filtered/reviewed applicants; downloaded a portfolio; shortlisted and approved one Creator; verified capacity remained 1 of 1, with no further approval action; rejected a second applicant; confirmed the approved Creator could see both decision reasons and could not withdraw.
- Output screenshots are saved under `.local/screenshots/module-7-task-3-*.jpg` using disposable synthetic data. Temporary verification accounts/campaign/files were removed afterward; screenshots are retained. Verification servers were stopped to avoid duplicate listeners.

Task 4 active campaign workspace and its workflow checks are complete; see MODULE_07_TASK_04.md.
