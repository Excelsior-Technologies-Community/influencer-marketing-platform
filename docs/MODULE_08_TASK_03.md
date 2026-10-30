# Module 08 Task 3 — Brand Content Review

Completed on 23 October 2026: the owning Brand can inspect submitted content and private evidence, approve/reject/request revisions with required reasons, and share version-specific feedback with the Creator. Task 4 requested-change resubmission and completion checks remain pending.

## Setup and checking

1. Retain existing MySQL credentials in ignored `backend/.env`. Run `npm.cmd run db:migrate` and `npm.cmd run db:verify`. SQL 039–041 add the review table, Brand procedures, Creator feedback projection and version-limit guard. Existing SQL remains unchanged. Verification covers 34 tables, four views and 41 tracked SQL files.
2. Reuse the running app; start `npm.cmd run dev` only when stopped.
3. As owning Brand, open My campaigns → Open workspace → Review content. The queue shows Creator, deliverable/item, current content status/version and current evidence count. Search by Creator name, filter status and paginate; filters are URL-backed.
4. Open Review content. Inspect the saved link, caption, publication timestamp, notes and evidence. Downloads are authenticated, private and audited. External links are self-reported and are not fetched or verified by the platform. Check the campaign's requirements yourself; a file attachment is not globally mandatory.
5. Select earlier versions to inspect their exact content and evidence. Historical versions have no decision buttons. Show latest version returns to the current reviewable version.
6. Enter a Decision reason of 10–500 characters, choose Approve content, Reject content or Request revision, then confirm. The confirmation states the exact version and that the Creator can read the reason. Reload to confirm persistence. A competing Creator update requires you to reload and inspect the new version before deciding.
7. As Creator, open Content submissions → Evidence & version history. Current status and Brand feedback show the decision, target content version, timestamp and reason. The status captured when a content snapshot was saved remains distinct from the latest review status.

## Transition and timing policy

| Source | Decision | Result |
| --- | --- | --- |
| SUBMITTED, latest version | APPROVE | APPROVED |
| SUBMITTED, latest version | REJECT | REJECTED |
| SUBMITTED, latest version | REQUEST_REVISION | REVISION_REQUESTED |
| Already decided head | Any further decision | Rejected |

The active owning Brand must review a started IN_PROGRESS campaign. Approval/rejection may resolve submitted work after the content deadline; requesting revisions requires the content window to remain open and a version below 50 so another version can be saved. Version-50 content remains approvable/rejectable. Cancelled/completed/expired/paused/pre-start campaigns cannot receive decisions; historical reads remain available to active owners.

Each content version receives at most one immutable decision. Approved/rejected heads cannot be reversed here. REVISION_REQUESTED records the requested changes; Creator resubmission will be implemented in Task 4. Task 2 correction/upload/removal endpoints lock all decided states. A Brand can resolve work already delivered by a Creator whose account later becomes inactive, while inactive/suspended Brands cannot review or read protected files.

Review decisions do not create content versions or alter saved content/evidence. They update current submission status and append a separate review record tied to the exact saved content version. Prior snapshots retain their original saved status and files. Shared role → campaign → submission locks serialize decisions against Creator edits/uploads, competing reviews and cancellation. Status, review and safe audit commit atomically; stale version or already-decided state returns 409.

Approval applies to one deliverable item. It does not complete the campaign or release payment, even when all submitted items are approved. Task 4 will evaluate actual required-item completion. No notifications/email or financial effects are fabricated.

## API

Base: `/api/v1/brand/workspaces/:id/submissions`. Active owning BRAND_ADMIN bearer token required; POST also requires existing origin protection and `X-Requested-With: InfluenceWeb`.

| Method | Relative path | Purpose |
| --- | --- | --- |
| GET | `/` | Campaign queue, literal Creator search/status filters and pagination |
| GET | `/:submissionId/history?version=1` | Exact content/evidence snapshot, available actions and shared review history |
| POST | `/:submissionId/decision` | JSON `{version, decision, reason}` |
| GET | `/:submissionId/versions/:version/evidence/:fileId` | Version-scoped audited private PDF/WebP download |

List supports `q` up to 100 characters, `status` (SUBMITTED/APPROVED/REJECTED/REVISION_REQUESTED), page 1–100000 and pageSize 1–50. History version is optional (latest by default), 1–50. Decision version must be a numeric current version; actor, status and unrelated fields cannot be supplied. Unknown query/body fields are rejected.

Brand projections expose only submitted content, evidence and safe Creator name/account status. They do not expose contact/billing details, verification documents or portfolio assets. File reads enforce owning Brand plus exact campaign/submission/version/file membership, return no-store sandboxed/nosniff attachments with generated names, and audit safe IDs only. Reasons, captions, URLs, notes, titles and file bytes are excluded from audit metadata. The Creator history endpoint appends the same safe review projection without reviewer IDs/contact details.

Swagger 0.8.3 and Postman include all four Brand operations. Missing/foreign records are 404, wrong role/origin 403, unauthenticated/inactive actor 401, invalid fields 422, stale/decided/closed/limit state 409.

## Verification

- All 21 actual-MySQL Jest/Supertest suites and 239 tests passed, including 12 new Brand content review tests. Coverage: scope/roles, queue filters/pagination/safe projections, historical evidence, exact-version decisions, immutable approval/rejection/request feedback, stale versions, competing decisions/Creator edits, deadlines/closed states, inactive actors, strict fields/origins, version-50 boundary, no automatic campaign completion, cancellation races and safe audits.
- Production frontend build passed (116 modules). MySQL verification passed with 34 tables, four views and 41 tracked SQL files. Migration rerun skipped all 41 unchanged files. Live Swagger 0.8.3 served four new Brand operations.
- Browser: Brand combined Creator/status filters, inspected old/current versions, verified historical versions lack approval actions, downloaded private proof, approved item 1, requested revisions for item 2 and rejected item 3. Queue statuses persisted through full reload. Creator saw all three statuses and the specific revision reason after reload, with direct edits locked.
- Visually inspected `.local/screenshots/module-8-task-3-brand-decisions.jpg`, `module-8-task-3-approved-content.jpg` and `module-8-task-3-creator-feedback.jpg`. All use synthetic records; external demonstration links were not opened.
- Signed out and removed only synthetic reviews/content/versions/evidence, campaign/applications/allocations/files, users/sessions/audits and dedicated category. Existing API/frontend servers retained.

Module 08 Tasks 1–3 are complete. Requested-change resubmission and required-deliverable completion remain Task 4.
