# Module 10 · Task 3: In-app notifications

## What is included

The platform records private in-app notifications for the signed-in account. Notifications are created in the same MySQL transaction as the source workflow change, and a unique per-recipient event key prevents duplicate alerts when a source event is retried.

Supported events:

- A Creator applies or withdraws, and a Brand shortlists, approves or rejects an application.
- A Creator submits or resubmits content, and a Brand approves it, rejects it or requests changes.
- Test Mode campaign funding succeeds or fails.
- Creator earnings are released to the test wallet; the Brand also receives a release confirmation.
- Refund status changes.
- A payment exception is opened for Super Admin review.

The inbox is available from **Notifications** in each account menu. It shows newest first, paginates results, marks one or all as read, and links to the relevant workflow. Read status is private to the recipient and irreversible. Email and real-time push are not included in this task.

## Setup

From the project root, apply the schema and procedure changes:

```powershell
npm.cmd run db:migrate
```

Then start the API and web app using the existing project start instructions. Sign in with a Brand, Creator or Super Admin account and open **Notifications** in the left menu.

## API

All endpoints require an authenticated session and operate only on the signed-in user’s notifications:

- `GET /api/v1/notifications?page=1&pageSize=20`
- `GET /api/v1/notifications/unread-count`
- `POST /api/v1/notifications/read-all`
- `POST /api/v1/notifications/{id}/read`

The inbox response includes pagination totals and unread count. Invalid page sizes are rejected. A notification belonging to another account is returned as not found.

## How to check

1. Apply migrations and confirm `in_app_notifications` is present with `npm.cmd run db:verify`.
2. Sign in as Brand and Creator in separate browser profiles.
3. Submit a Creator campaign application. Check that only the campaign’s Brand gets the new-application alert.
4. Change that application’s status as the Brand. Check that only that Creator receives the status alert.
5. Submit content as the Creator and review it as the Brand. Confirm each alert goes to the other party and links to the relevant campaign workflow.
6. Visit **Notifications**, mark one item read, refresh, and confirm its read state persists. Use **Mark all as read** and check the unread count becomes zero.
7. While authenticated as a different account, request the first user’s notification ID. It must not reveal or modify that notification.

OpenAPI documentation is at `/api-docs/`. The endpoints are documented in `backend/src/docs/notifications.openapi.js`.
