# Module 11 Task 2 - Campaign performance analytics

## Completed

Brand accounts can open **Campaign analytics** from the left menu or the Brand dashboard. The paginated, filterable list reports per campaign:

- Applications and distinct approved Creator allocations.
- Required, submitted and approved deliverable counts.
- Saved campaign budget, captured Test Mode funding, posted gross release, Creator wallet credits, commission, processed refunds and remaining held balance.
- Budget release progress when an INR budget is available.

All campaign rows are restricted to the authenticated Brand. Financial values come from posted MySQL wallet ledger entries and remain in integer paise; the UI formats them as INR. Campaigns using a non-INR budget do not display INR amounts as if they were comparable.

Campaign post-letevel reach, impressions, views and engagement are shown as **Not recorded**. The database has no campaign-post performance source/provider configured; Creator profile metrics are self-reported and are not treated as campaign performance. No sample metrics are inserted.

## Setup

Apply the new MySQL stored procedure from `backend`:

```powershell
npm run db:migrate
```

Restart the API if it was already running before the procedure was installed.

## Check in the app

1. Sign in as a Brand and select **Campaign analytics** in the left menu.
2. Confirm only campaigns owned by that Brand are listed.
3. Search by campaign title and filter by campaign status; use pagination when there are more than ten matches.
4. Compare applications, Creator allocations and deliverables with the corresponding campaign workflow pages.
5. Expand **Payment breakdown and performance data**. Confirm posted Test Mode amounts appear in INR and unsupported campaign post metrics are labeled **Not recorded**.
6. Sign in as a different Brand and confirm the first Brand's campaign rows are absent.

API: `GET /api/v1/brand/analytics/campaigns` (`/api-docs/` describes filters and ownership). Responses are `no-store`; campaign ID and Brand ID are never accepted as scope inputs.
