# Module 07 Task 4 — Active Campaign Workspace and Workflow Verification

Completed on 23 October 2026. Module 07 Tasks 1–4 are complete for the local MySQL workflow. Content submission, evidence, content review and completion conditions remain Module 08; payments remain Module 09.

## Setup and check

1. Retain the existing MySQL configuration in ignored `backend/.env`. Run `npm.cmd run db:migrate` and `npm.cmd run db:verify`. SQL files 032–033 add workspace procedures, including composite deliverable keys, without changing existing applied files or adding tables. There are 29 tables, three existing views and 33 tracked SQL files.
2. Start the app once using `npm.cmd run dev` when stopped. Open http://localhost:5173.
3. As Creator, open My campaigns. An application must be APPROVED and have its saved slot allocation before the campaign appears. Pending, shortlisted, rejected and withdrawn applications do not open a workspace. The empty state explains this.
4. As owning Brand, open Campaigns → Applicants → Review applicant. Approve an eligible application with a reason and confirm. Open campaign workspace appears on the approved detail. My campaigns also lists the campaign. Brands with no allocated Creators see an empty workspace list.
5. Search My campaigns by campaign title or Brand name, optionally filter status, then open the workspace. Filters/page are URL-backed. Refresh/reload reads current MySQL state.
6. Verify campaign description, requirements, schedule and content deadline, deliverables/platform/content type/quantity, private brief/reference downloads and allocation details. Quantities apply to each allocated Creator. Overall planning budget is not an individual fee or confirmation of payment.
7. Creator sees only their own allocation and a link to their application. Brand sees allocated Creator names/account status and applicant links, with Manage campaign/Review applicants links. Neither workspace exposes contact/billing details, verification evidence, pitch or private lifecycle reasons.
8. Close applications, start, pause or cancel a campaign through its existing lifecycle workflow. Allocated participants retain workspace access independently of discovery availability, elapsed deadlines or later catalog/eligibility changes. Paused/cancelled/closed states are labelled. Active account authentication is still required. Cancellation retains approved allocations and rejects undecided applications through Task 3's atomic policy.

## API and access

For each prefix `/api/v1/brand` and `/api/v1/creator`:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/workspaces` | Owned allocated campaigns, search/status filters and pagination |
| GET | `/workspaces/:id` | Safe campaign, schedule, deliverables, files metadata and participant projections |
| GET | `/workspaces/:id/files/:fileId` | Audited private PDF/WebP attachment |

The role comes from authentication, never a client query. Stored procedures repeat active-role checks. Detail/list require the owning Brand or the allocated Creator and an APPROVED application. Knowing the campaign ID is insufficient. List supports literal `q` up to 100 characters, status, page 1–100000 and pageSize 1–50. Invalid/unknown queries are rejected. All responses are no-store. Reads use a consistent snapshot; attachment reads repeat authorization and association checks under the shared lock and audit only safe IDs, with sandbox/nosniff headers.

Deliverable identifiers derive from the existing `(platform_id, content_type_id)` composite primary key within the campaign. Workspaces show required work; they do not invent submission progress, completion, earnings or performance statistics. Closed campaign access is historical access, not permission to restart a cancelled campaign.

## Verified

- All 18 Jest/Supertest suites and 203 tests passed, including ten new actual-MySQL workspace checks. Full suite retains eligibility/deadline/duplicate, last-slot concurrent approval, withdrawal and cancellation tests from Tasks 1–3.
- New coverage: full apply → approval → allocation → workspace; missing allocation and every unapproved status; strict ownership and role checks; safe self-only participant projection; pagination/literal search/status; disappearance from discovery while workspace persists; catalog changes; cancellation history; audited scoped file downloads; suspension and malformed inputs.
- Production frontend build passed with 111 modules. Database verification passed. Migration rerun skipped all 33 unchanged applied files. Live Swagger 0.7.4 returned HTTP 200 with six workspace operations. Postman includes both role workflows.
- Browser: pending Creator had no workspace; Brand approved an application, opened its workspace, checked schedule/required reels/briefs/allocation and combined list filters. Approved Creator saw their own allocation, downloaded the brief and reloaded saved details. Cancelling the synthetic campaign changed the visible state to CANCELLED while retaining details and allocation.
- Visually inspected screenshots: `.local/screenshots/module-7-task-4-brand-workspace.jpg`, `module-7-task-4-creator-workspace.jpg` and `module-7-task-4-cancelled-workspace.jpg`.
- Synthetic verification records were removed after sign-out. Existing user data retained. Servers started for verification were stopped to avoid duplicate listeners.

Module 08 can now build content submissions against the approved participant and required deliverable data.
