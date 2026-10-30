# Module 10 · Task 2: Campaign conversations and messages

## What this task adds

Each approved Creator allocation has a private message thread with the campaign's owning Brand. This keeps messages for different Creators in the same campaign separate. Active Brand and Creator participants can send messages and read the history; unrelated users and other Creators cannot access the thread.

Messages are retained, up to 4,000 characters, and cannot be edited or deleted through the application. When a participant opens a page of messages, the application records read receipts for the incoming messages shown on that page. The sender sees whether the recipient read a message, and the conversation list shows unread counts.

A message can include one private attachment: PNG, JPEG, WebP or PDF, up to 5 MiB. Images are normalized and PDFs are checked and sanitized using the existing private-file pipeline. Files are stored in MySQL, are downloaded only through an authorized participant endpoint, and each download is audited. Attachments cannot be edited or removed.

## Files and API

- `backend/migrations/060_campaign_conversations.sql` creates message, read-receipt and attachment tables with retention guards.
- `backend/stored-procedures/060_campaign_conversations.sql` checks participant access and records messages, reads and audited attachment downloads.
- `backend/src/middlewares/message-attachment-upload.middleware.js` limits message-file uploads.
- `backend/src/services/creator-file-validation.js` validates and sanitizes supported files before MySQL storage.
- Brand and Creator endpoints are under `/api/v1/{brand|creator}/workspaces/{campaignId}/conversations`.
- OpenAPI documentation is available at `/api-docs/`. Postman requests are in the Module 10 Task 2 folder in `docs/postman/Influencer-Marketing.postman_collection.json`.

The main operations are:

- `GET .../conversations` lists threads for an owned or allocated campaign workspace.
- `GET .../conversations/{applicationId}/messages` returns a bounded, paginated message history.
- `POST .../conversations/{applicationId}/messages` sends text.
- `POST .../conversations/{applicationId}/attachments` sends one private file with optional message text.
- `POST .../conversations/{applicationId}/read` records up to 50 visible incoming messages as read.
- `GET .../conversations/{applicationId}/messages/{messageId}/attachments/{attachmentId}` downloads a private file after participant and thread checks.

## Apply and use

1. Confirm `backend/.env` points to the intended local MySQL database. Keep its password in that file.
2. From the project folder, run `npm.cmd run db:migrate` to apply the message tables and stored procedures.
3. Start the app with `npm.cmd run dev` if it is not already running.
4. Sign in as the Brand owner or an approved Creator and open **My campaigns**.
5. Open a campaign workspace and choose **Campaign conversations**. A Brand sees a separate thread for each approved Creator; a Creator sees only their own thread with the Brand.
6. Send a text message, or send a supported private attachment. Open the thread as the other participant to create a read receipt.

The task does not add email or live push delivery. Those are covered by later Module 10 tasks.
