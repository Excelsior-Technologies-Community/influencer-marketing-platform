# Module 11 Task 3 - Creator and user activity analytics

## Completed

- **Creator analytics** (`/creator/analytics`) displays saved social-account follower counts, average views and engagement rate with a clear **SELF-REPORTED** source. It also reports the Creator's own page visits, total browser-tab sessions, average session duration, most visited screen, highest time-spent screen and per-screen activity.
- **Super Admin user activity** (`/admin/analytics`) shows aggregate users tracked, total sessions, page visits, average session duration, today's active users (UTC) and top screens. It never returns individual user IDs or session IDs.
- Signed-in route changes record a normalized screen and client-measured elapsed time. A browser-tab session ID is kept in `sessionStorage`; each page event has an idempotency UUID and duration is capped at 30 minutes.
- Tracking excludes query strings, raw user-agent values and device fingerprints. The current page is saved when the user navigates to another screen.
- Profile views, campaign reach and campaign engagement are not reported as measured because the project has no verified source for those values. Saved Creator social metrics remain explicitly self-reported.

## Setup

From `backend`, apply the new MySQL activity table and procedures:

```powershell
npm run db:migrate
```

Restart the API and frontend if they were running before the changes.

## Check in the app

1. Sign in as a Creator and use **Analytics** in the left menu.
2. Navigate between a few Creator screens. Return to Analytics and press **Refresh analytics**; the completed page visits and elapsed times should appear.
3. Confirm social metrics show their saved values and are described as self-reported. Missing values stay “Not provided.”
4. Sign in as Super Admin and open **User activity**. Confirm only aggregated screen/session totals appear, with no account or session identifiers.
5. Before any tracked navigation, both activity views should show empty/zero states instead of fabricated data.

API endpoints: authenticated `POST /api/v1/analytics/events`, Creator-only `GET /api/v1/creator/analytics`, and Super Admin-only `GET /api/v1/admin/analytics/user-screens`. All analytics reads use `no-store` responses.
