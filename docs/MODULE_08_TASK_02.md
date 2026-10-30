# Module 08 Task 2 — Private Evidence and Version History

Completed on 23 October 2026. Creators can attach private content evidence, save corrected content details, view the original and later versions, download historical files, and remove evidence from the latest version without erasing history. Task 3 Brand review is complete; see MODULE_08_TASK_03.md. Requested-change resubmission/completion remain Task 4.

## Setup and check

1. Keep MySQL credentials in ignored `backend/.env`. Run `npm.cmd run db:migrate` and `npm.cmd run db:verify`. SQL 036–038 add three tables, backfill original snapshots for existing submissions and add version/evidence procedures. Previously applied SQL stays unchanged. Database verification covers 33 tables, four views and 38 tracked SQL files.
2. Reuse the existing development servers. Start `npm.cmd run dev` only when stopped; do not start duplicate listeners.
3. Sign in as Creator → My campaigns → Open workspace → Content submissions → Evidence & version history beside a saved submission.
4. The page shows the latest version, selected snapshot, attached files and change history. Select a prior version to inspect the content URL, caption, publication time, notes, change reason and exact files retained at that point. Historical versions are read-only. Show latest version returns to current data.
5. To correct content, enter a Change reason (10–500 characters), update the URL/caption/publication time/notes, choose Review content changes and Confirm new version. The original snapshot remains intact. A no-change save is rejected.
6. To upload proof, enter a Change reason, Evidence title and file. Choose Review evidence upload, check the confirmation and confirm. Each upload creates a version containing the unchanged content and the new current evidence set. Images are normalized to WebP; PDFs are sanitized/restricted. Use content proof, not identity documents.
7. To remove a current file, enter a Change reason, choose Remove from latest version for that file and confirm. Only membership in the latest evidence set changes. Choose an earlier version to download the retained file. Removal does not reclaim historical storage. To replace evidence, remove the current file and upload the replacement as a later version.
8. Reload the page and verify selected version, content and evidence persist in MySQL. Version selection is URL-backed.

## Rules and limits

- Only the active owning Creator with an APPROVED allocated application can read these endpoints. Brand/admin content review access is not included in Task 2. Creator verification documents and portfolio assets are separate and cannot be accessed through these file endpoints.
- Changes require current `SUBMITTED` status, active Brand, an IN_PROGRESS campaign with the start reached and content deadline not passed, and the current expected version. Approval/rejection/revision workflow is later work. Closed/cancelled campaigns retain read-only history.
- Publication time must still be between campaign start and current server time; URL/caption/notes retain Task 1 validation. Campaign/deliverable/item identity cannot change through version edits.
- Every edit, upload or removal appends an immutable snapshot and increments the current version. Shared role/campaign/submission locks, expected-version checks and transactional audit prevent lost updates and orphaned files. Stale writes return 409; reload before retrying.
- Up to 50 versions per submission, including the original; five current evidence files; 5 MiB per upload; 25 MiB cumulative normalized retained file storage per submission. Historical bytes continue counting after removal. Image duplicates already attached to the current version are rejected by normalized hash.
- Supported uploads: PNG/JPEG/WebP images, normalized with metadata stripped, bounded to 10 million pixels and non-animated; PDF 1–20 pages without forms, actions, external links, embedded files or encryption. Original client filenames are not retained.
- Each version stores a complete content snapshot and exact evidence membership. Files are private MySQL blobs. Downloads require campaign/submission/version/file association and repeat authorization, with no-store, sandbox/nosniff and generated attachment names. File reads are audited.
- Audit metadata contains safe IDs, change type and version; content URLs, captions, notes, reasons, titles, filenames and file bytes are excluded. Human reasons are retained in the Creator's version history.
- No content approval, requested resubmission, campaign completion, payment or earnings action is performed by these changes.

## API

Base: `/api/v1/creator/workspaces/:id/submissions/:submissionId`. Creator bearer token required. All writes also use existing origin protection and `X-Requested-With: InfluenceWeb`.

| Method | Relative path | Purpose |
| --- | --- | --- |
| GET | `/history?version=1` | Original or selected snapshot; omit version for latest |
| POST | `/versions` | Corrected content details, expected version and change reason |
| POST | `/evidence` | Multipart `file`, `title`, string `version`, `reason` |
| POST | `/evidence/:fileId/remove` | JSON expected `version` and `reason`; retains historical file |
| GET | `/versions/:version/evidence/:fileId` | Private version-scoped audited file download |

Edit JSON: `version`, `reason`, `contentUrl`, `caption`, ISO `publishedAt` with timezone, optional `notes`. No caller-supplied actor, status, deliverable or file-owner fields. Unknown fields/queries are rejected. Successful changes return 201 and latest history payload; reads return 200. Missing/foreign version/file is 404; stale/closed/locked/unchanged/limit/duplicate is 409; invalid fields/files 422; oversize upload 413.

Swagger 0.8.2 documents all five operations. Postman includes latest/original reads, correction, upload, removal and historical download. Use the current version from history before every write.

## Verification

- All 20 actual-MySQL Jest/Supertest suites and 227 tests passed, including 12 new version/evidence tests. Coverage: original snapshot creation, corrected values and URL path case, exact evidence membership, normalized image/PDF download headers, historical removal retention, role/campaign/submission/version/file scope, competing changes/no orphaned blobs, invalid/oversized uploads, strict fields, duplicate/count/cumulative byte limits, review/deadline/suspension gates, 50-version retention, cancellation race and audit privacy.
- Production frontend build passed with 113 modules. Database verification passed with 33 tables, four views and 38 tracked SQL files. Migration rerun skipped all 38 unchanged files. Live Swagger 0.8.2 served the new operations.
- Browser: corrected a caption (v2), uploaded PDF (v3), uploaded PNG normalized to WebP (v4), removed PDF from current evidence (v5), confirmed latest contains only the image, downloaded both retained files from v4, verified original caption/no files in v1, and verified selected history after full reload. No external content URL was opened.
- Visually inspected `.local/screenshots/module-8-task-2-version-history.jpg` and `module-8-task-2-original-version.jpg`, using synthetic data only.
- Signed out and removed only synthetic content/versions/evidence, owned campaign/applications/allocations/files, fixture users/sessions/audits and dedicated category. Existing API and frontend servers were reused and retained.
