# Module 07 Task 1 — Campaign Discovery and Details

Completed: Creator discovery of live campaigns, title/Brand search, combined platform/category/content-type/currency filters, pagination, campaign details and authenticated downloads of published briefs/references. Task 2 eligibility/apply/withdraw is complete; see MODULE_07_TASK_02.md. Task 3 Brand decisions/slot allocation is complete; see MODULE_07_TASK_03.md. Task 4 workspaces are complete; see MODULE_07_TASK_04.md.

Local setup excludes campaigns owned by accounts using the reserved `.invalid` email domain from Creator discovery, detail, brief downloads and new applications. Their MySQL records and existing history are retained; Super Admin history is unchanged.

## Setup and usage

1. Keep existing MySQL credentials in ignored `backend/.env`. Run `npm.cmd run db:migrate` and `npm.cmd run db:verify`. New immutable SQL files: migration 026 (visibility view) and procedures 027. Verification checks 26 tables plus the discovery view and 27 tracked SQL files.
2. Reuse running servers; otherwise start `npm.cmd run dev` once.
3. A Brand creates and prepares a campaign, submits it, receives Super Admin approval and publishes it during its application window (Module 06). A draft or approval alone is not discoverable.
4. Sign in as Creator → **Discover campaigns**. Search by campaign title or Brand name; select platform, category, content type and budget currency. Choose **Search campaigns**. Filters combine with AND. **Clear filters** resets them.
5. Results show Brand, description summary, selected platforms/categories/content types, exact total budget/currency, planned creator capacity and dates. Use pagination and **Refresh campaigns**.
6. Choose **View campaign**. Inspect description, requirements, per-Creator deliverables, all five dates, brief and references. Download buttons use authenticated, campaign-scoped endpoints. **Back** preserves the browse URL filters/page; refresh/reload also retains applied query filters.
7. If a campaign pauses, closes, expires, is cancelled, or its Brand/catalog selections become inactive, fresh list/detail/download requests stop exposing it. The detail page displays an unavailable message with retry/browse controls. Resuming a valid campaign restores access.

Budget is the total planning budget, not guaranteed Creator compensation. Planned slots are capacity, not remaining places. Application forms and tracking are added by Task 2; slot allocation belongs to Task 3. Browsing is available to active authenticated Creators even before identity verification; Task 2 implements application eligibility separately. Dates display in the browser's local timezone while API timestamps use UTC.

## Shared visibility and privacy rules

The SQL SECURITY INVOKER view `creator_discoverable_campaigns` is the single predicate used by list, detail and binary file reads. It requires LIVE status, an active Brand account, applications open ≤ database UTC now < application deadline, future campaign start, complete ordered schedule, positive budget and supported currency, valid slots, nonempty description/requirements, active platform/category/content-type selections (including category parent), coherent deliverables and one brief. It does not rely on the minute scheduler having caught up.

Default sort is updated time descending, then campaign UUID for stable ties. List/count and multi-result detail procedures use read-only consistent snapshots. Filters use bound values and literal substring matching rather than SQL wildcard patterns. Filtering by a parent category includes its direct children. No arbitrary sort/status/actor fields are accepted. Filter catalogs show active entries only; a selected entry that subsequently becomes unavailable can still be cleared.

Creator DTOs omit Brand email/phone/contact/billing, actor identifiers, review decisions/reasons, original filenames, file hashes and bytes. Published campaign brief/reference files are shared with active Creators only while discoverable. Draft upload/edit permissions remain Brand-only. Every download rechecks campaign/file association and visibility; file UUID alone does not grant access. Attachments use generated filenames, no-store/nosniff and sandbox CSP. Previously downloaded bytes cannot be revoked; current reads are gated.

## API

All routes use the `/api/v1` prefix, require active CREATOR Bearer authentication and return no-store responses. They are read-only and do not create applications or reserve slots.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/creator/campaigns` | Paginated open LIVE campaigns |
| GET | `/creator/campaigns/catalogs` | Active platforms, categories/parents and content types |
| GET | `/creator/campaigns/:id` | Campaign, choices, deliverables and published file metadata |
| GET | `/creator/campaigns/:id/files/:fileId` | Authenticated published file attachment |

Optional list query: `q` (title/Brand literal substring, ≤100 characters), `platformId`, `categoryId`, `contentTypeId` (positive integers), `currency` (INR/USD/EUR/GBP), `page` (1–100000, default 1), `pageSize` (1–50, default 10). Unknown fields and malformed IDs return 422. Wrong roles return 403; inactive/unauthenticated users 401; hidden/missing campaigns or mismatched files 404. Empty and beyond-last-page results retain accurate pagination metadata. Swagger version 0.7.1 and Postman include all four operations.

## Verification

All 15 suites / 169 tests passed, including ten actual-MySQL discovery tests. Coverage: exact decimal totals, structured catalog arrays, pagination, literal/combined search, parent/child categories and inactive parents, active catalog/Brand gates, every non-LIVE state, future opening and elapsed deadline without scheduler, required brief, strict query/UUIDs, role and suspension checks, safe DTOs and private file association/security headers.

Production build passed (104 modules). Database verification and immutable migration rerun passed. Browser verification used synthetic Brand/admin/Creator data: combined search/platform/content/currency filters, detail fields, PDF brief and WebP reference downloads, back navigation retaining filters, paused campaign disappearing and direct detail becoming unavailable, resume/retry restoring access. Screenshots were visually inspected:

- `.local/screenshots/module-7-task-1-campaign-discovery.jpg`
- `.local/screenshots/module-7-task-1-campaign-detail.jpg`

Signed out and removed only temporary accounts/campaign/planning/files/history/audits/sessions and the category created for verification. Existing user records retained. Servers started for verification stopped afterward to avoid duplicate port listeners.
