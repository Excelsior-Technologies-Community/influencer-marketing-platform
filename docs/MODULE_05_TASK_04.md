# Module 05 Task 4 — Creator Dashboard and Combined Workflow

The Creator dashboard at `/creator` is the signed-in landing page. `/creator/dashboard` redirects there. The role-specific sidebar shows Dashboard, My profile, Social accounts and Media & documents.

## Setup and check

1. Keep existing MySQL credentials in ignored `backend/.env`. Run `npm.cmd run db:migrate`, then `npm.cmd run db:verify`.
2. Reuse existing servers or start `npm.cmd run dev` once.
3. Sign in as Creator. An empty account shows 0% profile completeness, empty social/portfolio sections and PENDING verification. Unknown audience values say Not reported.
4. Add bio, location, languages, skills and an active catalog category under My profile.
5. Add a social account on an active catalog platform. All metrics remain explicitly self-reported.
6. Upload a photo, portfolio image/PDF and verification evidence under Media & documents. Return to Dashboard or choose Refresh dashboard.
7. All eight profile essentials produce 100% completeness. Evidence is counted separately; uploads do not verify identity.
8. Super Admin can review private evidence and update verification through the existing Creator account review screen. Refresh the Creator dashboard to see that decision.
9. Edit/remove profile fields, social accounts or uploads; refresh to see current readiness/counts. Cross-account access remains blocked.

## Real data and definitions

The eight completeness checks are bio, location, languages, skills, at least one active category, profile photo, social account on an active platform and portfolio sample. Percentage is rounded completed/8 × 100. Identity/verification and evidence are not completeness checks. Historical inactive categories/platforms stay visible but do not satisfy active-choice checks. Dashboard guidance explains when no active catalog choices are available.

Social audience total is the sum of provided follower/subscriber counts, including saved unavailable-platform accounts. Blank values are excluded; all unknown means null, known zero remains zero. Counts may overlap across platforms; this is not unique reach. Engagement/views are displayed per account rather than inventing a cross-platform average. Provider ownership and metrics remain unverified even when Super Admin verifies the Creator identity.

Photo/portfolio previews use private authenticated downloads. The dashboard includes only metadata/counts for verification evidence, not document contents. Next steps point to real implemented pages. Campaigns, earnings, analytics and provider synchronization have no simulated totals.

## API and persistence

GET `/api/v1/creator/dashboard`: active CREATOR only, no query parameters or caller-selected owner. Private `Cache-Control: no-store`. Returns profile, readiness/checks/missing, social accounts/counts/provenance, media metadata/counts, verification guidance, catalog availability and next steps.

`sp_get_creator_dashboard` reads the related tables in a read-only consistent MySQL snapshot. No new tables or write endpoints are added. Dashboard reads do not modify verification, revisions, profile data or audit history. Other roles are rejected and suspended sessions cannot read it.

Swagger/Postman include the dashboard. Combined actual-MySQL tests cover empty defaults, isolation, profile/social/upload setup, 100% readiness, null/zero metrics, admin review, unavailable catalogs, removals, safe DTOs, read-only behavior and suspension. Module 05 core local workflows are complete. OAuth/provider sync and cloud-storage adapters remain configuration-dependent integrations; later campaign/payment/analytics modules expand the dashboard when real data exists.
