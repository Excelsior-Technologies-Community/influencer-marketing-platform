# Module 06 Task 2 — Campaign Briefs and Schedule Validation

Completed: private brief/reference uploads, campaign/application/content dates, and saved-data readiness checks. Editing is restricted to the owning active Brand and DRAFT status. Task 3 submission/approval is complete; see MODULE_06_TASK_03.md. Publishing/lifecycle is complete in Task 4; see MODULE_06_TASK_04.md.

## Setup and usage

1. With existing MySQL credentials in ignored `backend/.env`, run `npm.cmd run db:migrate`, then `npm.cmd run db:verify`.
2. Reuse servers or run `npm.cmd run dev` once. Sign in as Brand Admin → Campaign drafts → open/save a draft.
3. Choose **Manage schedule & files** (`/brand/campaigns/:id/preparation`). Checks use saved campaign details; save content edits before opening this page.
4. Complete applications open, application deadline, campaign start, content deadline and campaign end. Save schedule. Clear dates then save to remove the schedule.
5. Upload one BRIEF and optionally up to five REFERENCE files. Replace/remove with current file revisions; download private files through authenticated buttons.
6. Refresh checks. Complete required description, budget/currency, slots, requirements, active platforms/categories/content types, deliverables, schedule and brief. A complete result remains DRAFT; no submission occurs.

## Date rules

All five dates must be present, or all null. Order: **applications open < application deadline ≤ campaign start < content deadline ≤ campaign end**. Equal application deadline/start and content deadline/end are permitted. Inputs require an explicit Z or UTC offset in the API; the UI shows the browser's local time zone and converts to UTC. MySQL stores DATETIME(3); responses are UTC ISO timestamps.

Draft schedules can remain in the past so owners can fix expired plans. Preparation is ready only when the application deadline and campaign start are still in the future, as well as all other required checks. Application opening may already have occurred. The checks are advisory and recalculated; Task 3 revalidates saved fields/dates/catalogs under the submission write lock rather than trusting an earlier readiness response.

Schedule revisions start at 0 and increase on every successful save/clear. They are independent of campaign content and file revisions, so editing details cannot erase dates or uploads. Stale/concurrent updates return 409 and do not overwrite newer data.

## File rules and privacy

One brief and five references per campaign; each at most 5 MiB. PNG, JPEG, WebP and PDF only, with matching extension/type and validated contents. Images must be static, at most 10 million pixels and 8192px per dimension, then are rotated/resized to at most 2000px and reencoded WebP without original metadata. PDFs must be unencrypted, 1–20 pages, without forms/actions/links/embedded files; pages are copied into a fresh document. PDF downloads are attachments with restrictive sandbox CSP. Existing validation is shared with Creator uploads.

Storage is private MySQL MEDIUMBLOB with generated UUID filenames, hashes, byte size, dimensions/page count and revisions. Original filenames and raw bytes do not enter metadata/audits. No public upload directory/URLs are introduced. Saved files can be replaced or removed only while DRAFT, with owner/campaign/file association and revision checks. A removed/re-added brief has a new UUID. Read-only owner downloads remain possible after a later status change. Admin/Creator access for later workflows is not granted in Task 2.

## API

- GET `/api/v1/brand/campaigns/:id/preparation`: status, schedule and file metadata.
- PUT `/api/v1/brand/campaigns/:id/schedule`: JSON five nullable date fields and numeric `revision` (required). Omitted date fields default null; full replacement.
- GET `/api/v1/brand/campaigns/:id/readiness`: ready, checks, missing, checkedAt and note. No state change.
- POST `/api/v1/brand/campaigns/:id/files`: multipart kind (BRIEF/REFERENCE), title (2–120 chars), file.
- PUT `/api/v1/brand/campaigns/:id/files/:fileId`: multipart title, revision, file; kind immutable.
- GET same file URL: private binary download.
- DELETE same file URL: JSON `{revision}`.

All require owning active BRAND_ADMIN. Mutations require `X-Requested-With: InfluenceWeb` and allowed Origin. Strict query/body validation blocks ownership/status injection. Invalid fields 422, oversized bytes 413, missing/foreign IDs 404, stale/quota/non-draft 409. All responses no-store.

New tables: `campaign_schedules`, `campaign_files`. New procedures lock role/user/Brand/campaign before writes, serialize quotas and atomically store changes/audits. Applied Task 1 SQL remains unchanged. Safe audit data stores revision/kind/counts, not private titles/bytes/schedules. MySQL backups must include blobs.

139 tests across 12 suites passed, including 11 actual-MySQL preparation checks for UTC/offset persistence, ordering/partial/invalid dates, revision races/clear, private uploads/downloads, spoofing/active PDFs/size/multipart limits, quotas, ownership, non-draft protection, suspension, independent revisions, readiness and safe audit data. Tasks 3–4 remain pending.
