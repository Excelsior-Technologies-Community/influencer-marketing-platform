# Module 11 Task 1 - Role-based dashboards

## Completed

The existing dashboard pages now include current workflow summaries from MySQL:

- **Super Admin:** platform account, verification, catalog and campaign totals, plus six UTC months of Brand and Creator registration counts.
- **Brand:** only the signed-in company's campaign counts, campaign review queue, pending application decisions and distinct approved creators.
- **Creator:** only the signed-in Creator's application totals, decisions awaiting response, approved collaborations, active collaborations and completed collaborations.

All protected dashboard endpoints derive the owner from the authenticated session. The SQL aggregates also check that the account is active and has the expected role. Empty activity appears as zero. These cards report workflow records, not social performance; no reach, engagement, revenue or ROI is invented.

## Setup

From `backend`, apply the new numbered database procedure set using the configured MySQL account:

```powershell
npm run db:migrate
```

Then restart the API and frontend if they were already running.

## Check in the app

1. Sign in as a Super Admin and open **Dashboard**. Confirm the account/catalog cards, campaign activity cards and registration trend appear.
2. Sign in as a Brand and open **Dashboard**. Confirm campaign/application cards show records for that Brand only.
3. Sign in as a Creator and open **Dashboard**. Confirm application/collaboration cards show records for that Creator only.
4. New accounts should show zero campaign/application totals. Add workflow records to see the corresponding counts update.
5. Use the dashboard refresh controls after creating workflow records.

All three API routes return `Cache-Control: no-store`. The server passes the authenticated user ID to the role-specific read procedures; the UI never supplies an account ID for dashboard scope.

## Files

- `backend/stored-procedures/063_role_dashboards.sql`
- `backend/src/services/brand.service.js`
- `backend/src/services/creator-dashboard.service.js`
- `backend/src/services/admin.service.js`
- `frontend/src/pages/brand/BrandPanel.jsx`
- `frontend/src/pages/creator/CreatorDashboard.jsx`
- `frontend/src/pages/super-admin/AdminPanel.jsx`
