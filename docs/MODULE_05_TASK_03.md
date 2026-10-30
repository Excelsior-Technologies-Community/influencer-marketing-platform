# Module 05 Task 3 — Creator Photo, Portfolio and Verification Files

Completed: private Creator uploads and generated downloads in MySQL, with metadata, content hashes, validation, limits, ownership, transactional audit and revision checks. Existing profile/social data remains independent. No cloud credentials are needed for local storage.

## Use and check

1. Keep existing credentials in ignored `backend/.env`. Run `npm.cmd run db:migrate`, then `npm.cmd run db:verify`.
2. Reuse existing servers, or run `npm.cmd run dev` once.
3. Sign in as Creator → **Media & documents** (`/creator/media`). Choose section, title and file, then **Upload file**.
4. Reload: saved images/metadata remain. **My profile** uses the uploaded profile photo. Use Replace to upload new bytes/title, or Remove and confirm to remove a file.
5. Verification documents remain private to the owner and active Super Admin. Super Admin → Creators → account details → Verification evidence. Download evidence before using the existing verification decision controls.

Uploading/removing/replacing evidence does not change verification status or assert a verified identity. Review decisions remain with Super Admin. The full Creator dashboard is complete in Task 4; see MODULE_05_TASK_04.md.

## Limits and formats

| Section | Maximum | Input size | Formats |
|---|---:|---:|---|
| Profile photo | 1 | 2 MiB | PNG, JPEG, WebP |
| Portfolio | 10 | 5 MiB each | PNG, JPEG, WebP, PDF |
| Verification documents | 5 | 5 MiB each | PNG, JPEG, WebP, PDF |

Images: matching extension/MIME/signature, successful decode, no animation, at most 10 million pixels, maximum 8192px per dimension. They are rotated/resized (photo 512px; other images 2000px) and re-encoded as WebP without original metadata. Videos/archives/SVG are not accepted by this bounded upload implementation.

PDFs: parsed, 1–20 pages, unencrypted. Forms, links, JavaScript/actions and embedded files are rejected; page content is copied into a fresh document. PDFs download as attachments with restrictive sandbox CSP. No original filenames/paths are kept or exposed. This validation is not a malware-scanning service.

Titles: trimmed 2–120 characters. One file per request. Existing IDs remain during replacement; revisions increase. Remove/add creates a new ID, so stale removals cannot erase new photos. Kind is immutable during replacement. Quotas serialize under owner locks to prevent races. No public object URLs; browser preview URLs are temporary authenticated blobs and are revoked.

## API and storage

- GET `/api/v1/creator/media`: own metadata and verificationStatus.
- POST same URL: multipart `kind`, `title`, `file` (201).
- GET `/api/v1/creator/media/:id`: authenticated binary file.
- PUT same item URL: multipart `title`, `revision`, `file`.
- DELETE same item URL: JSON `{revision}`.
- GET `/api/v1/admin/creators/:id/verification-files`: Super Admin evidence metadata.
- GET `/api/v1/admin/creators/:id/verification-files/:fileId`: Super Admin evidence download; portfolio/photo IDs are rejected.

Mutations require Bearer authentication, allowed Origin and `X-Requested-With: InfluenceWeb`. Strict schemas reject owner/status injection. Stale edits return 409, missing/foreign files 404, invalid files 422, oversized inputs 413. Reload discards local edits. Sensitive evidence downloads are audited; audit metadata excludes titles, bytes and original filenames.

Table: `creator_assets` (private bounded MEDIUMBLOB, owner FK with cascade, kind, generated photo uniqueness, hash, bytes, dimensions/page count and revisions). Stored procedures coordinate role/user/creator locks, quotas, owner checks, storage/deletion and audit transactions. The existing MySQL backup/restore process must include the blob data. Provider/cloud adapters can be introduced separately when configured.

## Verification

108 tests across 9 suites passed, including 12 actual-MySQL asset checks: persistence/encoding, image/PDF validation, multipart/byte/pixel/page limits, private downloads, role/owner isolation, admin evidence-only access, concurrency, quotas, stale removal, suspension and audit privacy. Swagger and Postman cover implemented operations.
