# Module 10 · Task 4: Email delivery and deadline reminders

## What is included

This task adds an SMTP-backed email worker using the project’s existing Nodemailer dependency.

- Each newly created in-app notification is copied to the email outbox in the same MySQL transaction. A unique recipient/event key prevents duplicate queue rows.
- The worker sends transactional email for the notification events supported by Module 10 Task 3, with a link to the related in-app workflow.
- Once per minute, the worker queues reminders for application, content-submission and campaign-end deadlines that fall within the next 24 hours. Reminders go to the Brand and relevant active applicants or allocated Creators.
- A unique key includes the recipient, reminder type and scheduled deadline. Re-running the clock or changing campaign schedule cannot queue the same reminder twice for the same deadline.
- Jobs are claimed with a database lease so multiple API instances do not normally send the same queued job at once. Failed sends retry with increasing delays up to eight attempts, then move to `DEAD` for manual review. SMTP delivery is at-least-once: a connection loss after the mail server accepts a message can still cause a retry duplicate.
- Accounts using the reserved `.invalid` domain are local fixtures, not deliverable recipients. Their queued email is retained as `DEAD` with `INVALID_RECIPIENT` and is never sent or retried; in-app notifications remain available.
- If SMTP host or sender is not configured, the worker stays disabled. In-app notifications continue to work; queued email stays pending. No secret is stored in source control.

## Configure SMTP

Set these values in `backend/.env` (not in chat or committed files):

```dotenv
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-smtp-user
EMAIL_PASSWORD=your-smtp-password
EMAIL_FROM=Influence <notifications@example.com>
```

Use `EMAIL_SECURE=true` for an SMTP endpoint that requires implicit TLS, commonly port 465. If the provider does not require SMTP authentication, leave both `EMAIL_USER` and `EMAIL_PASSWORD` blank. Then restart the API; the worker begins automatically and checks the outbox once per minute.

## Database and runtime

The schema is in `backend/migrations/062_email_delivery.sql`; procedures are in `backend/stored-procedures/062_email_delivery.sql`. Apply them from the project root:

```powershell
npm.cmd run db:migrate
```

The worker sends at most ten emails per minute per API instance. Database claims coordinate multiple instances. Queue rows retain delivery status, attempts, timestamps and a sanitized error code; message bodies and destinations are retained for retry and audit.

## How to check

1. Configure a development SMTP inbox such as Mailpit using its SMTP host/port and a sender address, then restart the API.
2. Trigger a supported Module 10 event (for example, submit a Creator application). Verify the recipient receives one email and can open the workflow link after signing in.
3. Inspect `email_outbox`: the corresponding row should progress from `PENDING` to `SENDING` to `SENT`, with `attempts` incremented.
4. Set a test campaign application, content or end deadline to within 24 hours. Wait for the worker’s next minute tick; confirm one reminder per relevant active account.
5. Trigger the same schedule scan again and confirm no duplicate reminder appears for that user/deadline.
6. Temporarily use an unreachable development SMTP host. Confirm the row returns to `PENDING` with a future `available_at`, then reaches `DEAD` after eight failed attempts. Restore the valid SMTP settings afterward.
7. With SMTP unset, restart the API and confirm the app still runs and its in-app notifications remain available; no email attempts are made.

SMTP delivery and deadline timing are deployment configuration. No email provider or live SMTP account is included in the repository.
