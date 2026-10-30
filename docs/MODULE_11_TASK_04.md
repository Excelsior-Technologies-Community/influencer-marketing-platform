# Module 11 Task 4 — Filtered financial reports and CSV export

## What is included

Three signed-in, role-specific reports are available from the role sidebar:

- **Super Admin:** all posted Test Mode funding captures, per-Creator campaign releases and commission, and processed refunds.
- **Brand:** the same ledger events only for campaigns owned by the signed-in Brand.
- **Creator:** only that Creator’s posted campaign releases and net earnings.

Reports use the existing immutable MySQL wallet ledger. Pending/failed payments, unposted releases, unprocessed refunds, self-reported social metrics, and unverified campaign performance are not represented as completed financial activity. The Creator report excludes Brand funding and platform-wide commission data.

## Filters, pagination and export

All roles can filter by inclusive posting date range, campaign status, campaign UUID and campaign/Creator name. The maximum date range is 367 calendar days. JSON pages contain at most 50 rows. CSV export applies the same active filters and is limited to 5,000 matching rows; larger results require narrower filters. CSV cells are quoted and text is guarded against spreadsheet formula injection. Amount columns in CSV use paise/minor units; the website formats them as INR. Test Mode activity is clearly identified.

## Setup

Apply the analytics reporting stored procedure from the project root and rebuild/restart the app:

```powershell
npm.cmd run db:migrate
npm.cmd run build
npm.cmd run dev
```

The procedure is in `backend/stored-procedures/066_analytics_reports.sql`. It validates the authenticated role and derives Brand/Creator scope from MySQL records; report scope is never accepted from a request parameter.

## How to check it

1. Sign in as a Brand, open **Financial reports**, and compare capture/release/refund rows with that Brand’s campaign analytics and wallet.
2. Apply a date range, status, campaign UUID or search filter. Confirm the result count, rows and CSV export all use the same filters.
3. Sign in as a different Brand and confirm the first Brand’s campaigns are absent.
4. Sign in as a Creator. Confirm only that Creator’s released earnings appear, without other Creators’ payments or Brand funding.
5. Sign in as Super Admin and confirm the platform-wide posted ledger report is available.
6. Narrow a query until it has no matching rows; the page should show an empty state and CSV should contain its headers only.
7. Try a date range over 367 days, a malformed campaign UUID, and an export matching over 5,000 rows; each should be rejected with a useful error rather than silently truncating.
8. Open `/api-docs/` and inspect the three report endpoints. Requests require the matching role’s access token.

## API

- `GET /api/v1/admin/analytics/reports`
- `GET /api/v1/brand/reports`
- `GET /api/v1/creator/reports`

Query parameters: `from`, `to`, `status`, `campaignId`, `q`, `page`, `pageSize`, and `format=json|csv`. No report endpoint accepts a user ID or Brand ID as a scope selector. All responses are no-store. Excel/PDF generation is not included; CSV is the supported export format.
