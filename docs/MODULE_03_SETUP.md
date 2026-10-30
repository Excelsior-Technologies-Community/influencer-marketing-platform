# Module 03 - complete: Super Admin and reference catalogs

Module 03 implements the account and reference-data part of the Super Admin panel. Its data uses the existing MySQL database. Campaign approval, campaign/payment counts and financial reports are owned by later modules and are not shown as invented data.

## Start and sign in

```powershell
npm.cmd run db:migrate
npm.cmd run db:verify
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Run only one backend on port 4000. If it is already running, start just the frontend with `npm.cmd run dev -w frontend`.

Sign in at http://localhost:5173/login using your own SUPER_ADMIN account, then open http://localhost:5173/admin. No default/shared admin password is created. If needed, follow the controlled admin provisioning instructions in [Module 02](MODULE_02_SETUP.md).

## Completed screens

- **Overview:** actual brand/creator totals, active/suspended accounts, pending/verified creators, active categories/platforms/content types, and the last six months of brand/creator registrations.
- **Brands:** search by name/email/company, account-status filter, pagination, company/account details, activate/deactivate/suspend with a reason.
- **Creators:** search by name/email/location, status and verification filters, pagination, profile details, account status and verification review actions.
- **Categories:** create/edit top-level categories and one subcategory level; choose a parent; activate/deactivate entries; search/filter/pagination.
- **Platforms and content types:** create/edit unique codes and names, activate/deactivate, search/filter/pagination. Deactivation preserves historical references.
- **Audit history:** action/date filters, pagination, actor/entity/request ID and recorded change metadata. The screen has no audit edit/delete action.

All screens include loading, empty, validation and error states. Only active SUPER_ADMIN sessions can access admin APIs. Brand and Creator sessions are denied even if they call the API directly.

## Manual checks

1. Register a Brand or Creator through the public form if the database has no records to manage. Sign out, then sign in as your Super Admin.
2. Search Brands or Creators and open **Manage**. Compare the detail with the registered identity/profile.
3. Change an account to SUSPENDED or INACTIVE with a reason. Its existing access and refresh sessions must stop working immediately. Reactivate the account; old sessions remain invalid, and the account must sign in again.
4. Set a pending Creator to UNDER_REVIEW, then VERIFIED or REJECTED. Completed verification can be reopened only through UNDER_REVIEW. Every changed decision is audited with the supplied reason.
5. Create a category and a subcategory. Try deactivating the parent while the subcategory is active; the UI must show the business-rule error and preserve both records. Deactivate the child before the parent. Third-level nesting and cycles are rejected.
6. Add a platform or content type using a unique code. Edit it with a reason and uncheck Active; the record must remain listed as inactive. Duplicate codes are rejected.
7. Open Audit history, filter by ACCOUNT_STATUS_CHANGED or CATALOG_UPDATED, open **View change**, and check the actor, reason and before/after data. Try Next/Previous when multiple pages exist.
8. Sign in as a Brand/Creator and attempt /admin. The browser returns to the account's own workspace. Direct admin API requests with that token return 403.

Temporary automated/browser-test accounts and catalogs are removed after verification. Existing user data and default Instagram/Facebook/YouTube/content-type entries are not deleted by tests.

## Implemented APIs

All paths below use `/api/v1`, require a valid Bearer access token and active SUPER_ADMIN role. Mutations also require `X-Requested-With: InfluenceWeb`; browser Origin must match CLIENT_URL.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /admin/dashboard | Live account/catalog totals and six-month registration trend |
| GET | /admin/brands | Search, account-status filter and pagination |
| GET | /admin/brands/:id | Sanitized company/account details |
| PATCH | /admin/brands/:id/status | ACTIVE, INACTIVE or SUSPENDED with reason |
| GET | /admin/creators | Search, status/verification filters and pagination |
| GET | /admin/creators/:id | Sanitized creator/account details |
| PATCH | /admin/creators/:id/status | Account status with reason |
| PATCH | /admin/creators/:id/verification | Verification decision with reason |
| GET | /admin/catalogs/:kind | Catalog list/search/availability/pagination |
| POST | /admin/catalogs/:kind | Create category/platform/content type |
| PUT | /admin/catalogs/:kind/:id | Full edit including availability and reason |
| GET | /admin/audit-logs | Filtered, paginated audit history |

Catalog kind: `categories`, `platforms` or `content-types`. Brand/creator IDs are profile IDs returned by the admin lists; userId is their underlying identity. Catalog IDs are positive integers.

Lists accept page (default 1), pageSize (default 20, max 100), and q where supported. `%` and `_` in q are literal text. Account lists accept status; Creator lists also accept verification. Catalogs accept active=true/false. Audit accepts action, entityType, entityId, from and to. Audit dates use UTC day boundaries, with inclusive to. Pagination preserves total counts even for an empty requested page.

PUT catalog requests require name, isActive and reason, plus code for platforms/content types. For categories, parentId=null/omitted means top-level. Codes are normalized to uppercase. POST defaults isActive to true. No physical account/catalog deletion endpoint is exposed.

## Business rules and integrity

- Account status lives in users. Every changed status increments auth_version and revokes sessions in the same transaction. Idempotent repeats do not create duplicate status audit records. Deleted accounts cannot be revived. These endpoints never target Super Admin identities, avoiding accidental admin self-lockout.
- Verification: PENDING -> UNDER_REVIEW/VERIFIED/REJECTED; UNDER_REVIEW -> VERIFIED/REJECTED; VERIFIED/REJECTED -> UNDER_REVIEW. Equal-state requests are idempotent. All changes require a reason.
- Category hierarchy: top-level plus one child level. A parent with children cannot be moved under another category; cycles/self-parenting/third levels are rejected. Active children cannot belong to inactive parents. Deactivate active children before the parent. Catalog writes serialize through a database row lock to preserve these rules under concurrent edits.
- Admin writes recheck active SUPER_ADMIN membership in MySQL, then save business changes and audit entries transactionally. Reasons, actors, request IDs and before/after catalog values are recorded without password/session secrets.
- MySQL pool sessions use UTC; the UI displays timestamps in the browser's local timezone.

## Database and API documentation

New files: `006_admin_catalog_ids.sql` widens platform/content IDs, enables generated IDs and adds query indexes; `007_admin.sql` adds dashboard/list/detail/status/verification/catalog/audit procedures. Applied migrations remain unchanged. Seven tracked SQL files are now applied to the 11-table baseline.

Swagger: http://localhost:4000/api-docs/

Postman: import `docs/postman/Influencer-Marketing.postman_collection.json`. Sign in as SUPER_ADMIN using Authentication/Login, which saves access_token, then use the Super Admin folder. Set brand_id/creator_id from the lists, catalog_kind/catalog_id and the reason/status/verification variables. Role checks must use a token from the corresponding account.

The test suite verifies actual MySQL persistence, role restrictions, sanitized fields, search/pagination, bad inputs, session revocation, verification transitions, duplicate catalog codes/names, category hierarchy/concurrency, audit metadata, deleted-record protection and regression coverage for Modules 01–02.
