# Module 08 Task 1 — Creator Content Submission

Completed on 23 October 2026: approved allocated Creators can submit and track published content against individual campaign deliverable items. Data persists in MySQL with a safe audit trail. Task 2 evidence/version history is complete; see MODULE_08_TASK_02.md. Task 3 Brand review is complete; see MODULE_08_TASK_03.md. Requested-change resubmission/completion remain Task 4.

## Setup and checking

1. Keep the existing credentials in ignored `backend/.env`. Run `npm.cmd run db:migrate` and `npm.cmd run db:verify`. SQL 034–035 add `content_submissions`, `content_submission_windows` and two procedures. There are now 30 tables, four views and 35 tracked SQL files. Applied files remain unchanged.
2. Start the project once when stopped. If the frontend is already running, start only the API with `npm.cmd run dev -w backend`; otherwise use `npm.cmd run dev`. Open http://localhost:5173.
3. Sign in as Creator → My campaigns → Open workspace → Content submissions. An APPROVED application and persisted Creator allocation are both required.
4. The campaign must be IN_PROGRESS, its start reached, content deadline still in the future and Brand account active. The existing schedule worker/refresh moves eligible published campaigns into IN_PROGRESS. Before start or after closure, the page explains that the submission window is closed; existing records remain readable.
5. Choose an unsubmitted deliverable item. Platform and content type are fixed by the campaign, and required quantity becomes numbered items: for example, Reel 1 of 2 and Reel 2 of 2.
6. Enter a public HTTPS content URL, caption, published date/time in your local timezone and optional notes. Use current date and time only if that is the correct publication time. Publication must be between campaign start and current server time. The API stores UTC timestamps and the UI displays local time.
7. Choose Review submission, check the link/caption/date, then Confirm submission. The original snapshot is retained; later corrections use Task 2 versioned updates. Keep editing returns to the form.
8. Verify SUBMITTED status, version 1, platform/content type/item, URL, caption, publication/submission timestamps and notes under Saved submissions. Reload the page to confirm persistence. Saved items disappear from the form; after all items are submitted, the form is replaced by an all-items-submitted message.

Submission is not approval or campaign completion. No campaign lifecycle state, payment, earnings or performance numbers are changed. Links and publication details are self-reported; external content is not fetched, embedded or provider-verified. Evidence upload and version snapshots are Task 2, Brand review Task 3, revisions/completion Task 4.

## Data and access policy

- Each immutable initial submission links to an allocation/application and the campaign's `(platform_id, content_type_id)` deliverable key. Unit number is limited to that deliverable's saved quantity.
- Unique `(application_id, platform_id, content_type_id, unit_number)` prevents duplicate items. Shared role/campaign locks serialize duplicate writes and cancellation. A concurrent duplicate returns 409; reload before retrying after a network error.
- Active Creator ownership and an approved allocation are repeated inside the stored procedure. No caller-supplied Creator/application ID, status or version is accepted.
- Every write rechecks current window/Brand activity and publication time. Existing records remain readable by their active allocated Creator after the campaign closes or is cancelled. Other Creators and Brand/admin routes cannot access these Creator-only operations.
- Restrictive allocation and deliverable foreign keys retain submitted content. Task 2 provides dedicated versioned correction/evidence endpoints; the original snapshot remains immutable. Requested resubmission arrives in Task 4.
- Submission and `CONTENT_SUBMITTED` audit commit in one transaction. Audit metadata includes only campaign/application/deliverable/unit/version identifiers, never content URL, caption or notes.
- Lists use a consistent snapshot and pagination. All submitted unit numbers accompany deliverable metadata independently of the current page, so already-submitted items cannot reappear on later pages. Responses are private/no-store.

## API

Base: `/api/v1/creator/workspaces/:id/submissions`. Active Creator bearer token required. POST also requires the configured origin protection and `X-Requested-With: InfluenceWeb`.

| Method | Purpose |
| --- | --- |
| GET | Own campaign/window metadata, deliverables with submitted units, paginated submitted items |
| POST | Create one initial content submission; returns 201 and `data.submission` |

GET query: `page` 1–100000, `pageSize` 1–50 (default 10); unknown query fields are rejected.

POST fields: integer `platformId`, `contentTypeId`, `unitNumber`; `contentUrl` (public HTTPS syntax, 10–2048 characters, no credentials/custom port/IP/local hostname); `caption` (1–5000 characters); `publishedAt` (ISO datetime with timezone); optional `notes` (up to 2000 characters). Use IDs returned by GET, not guessed catalog IDs. Unknown fields are rejected.

Invalid payload/date/deliverable returns 422; closed window or duplicate item 409; missing/foreign/unallocated campaign 404; wrong role/origin 403; unauthenticated/inactive Creator 401. Swagger 0.8.1 and Postman include both operations.

## Verification

- All 19 actual-MySQL Jest/Supertest suites and 215 tests passed, including 12 new content tests: approved allocation gates, persistence and immutable initial records, duplicate race, separate numbered items, exact deliverable linkage/quantity, date/time validation, state/deadline gates, ownership/roles, safe HTTPS/strict inputs, suspension/Brand activity, pagination, cancellation race, mutation protection, audit privacy and retention FKs.
- Production frontend build passed with 112 modules. Database verification and unchanged migration rerun passed with 35 tracked SQL files. Live Swagger 0.8.1 returned HTTP 200 with GET/POST submission operations.
- Browser: opened an approved in-progress campaign, entered and confirmed two required reels, verified saved status/caption/notes/publication date, remaining-item selection, all-items-submitted state and persistence through both data reload and full page reload.
- Visually inspected `.local/screenshots/module-8-task-1-submission-confirmation.jpg` and `module-8-task-1-saved-submissions.jpg`. These contain synthetic data; demonstration URLs are not actual published campaign content and were not opened.
- Signed out and removed temporary content/applications/allocations/campaign/files/users, related audit/session rows and the dedicated category. The verification API was stopped; the existing frontend server was retained.
