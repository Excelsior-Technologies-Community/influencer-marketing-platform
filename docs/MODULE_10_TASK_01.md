# Module 10 · Task 1: Campaign reviews

## What this task adds

After a Brand completes a campaign, the owning Brand can review each approved Creator and each allocated Creator can review the owning Brand. A review has a required integer rating from 1 to 5 and an optional comment of up to 1,000 characters.

Reviews are attributed, visible only to their author and recipient, and retained permanently. Each participant can submit one review per recipient for a campaign. Reviews cannot be edited or deleted through the application. Super Admin has no review endpoint.

Eligibility is checked in MySQL on every read and submission: the signed-in account must be active, belong to the campaign, and have the correct Brand or Creator role. Campaign status must be `COMPLETED`; Creator participation comes from the campaign's approved allocation records. Recipient access is checked again when saving.

## Files and API

- `backend/migrations/059_campaign_reviews.sql` creates the review table and database immutability guards.
- `backend/stored-procedures/059_campaign_reviews.sql` contains the participant, completion and duplicate checks plus read/write procedures.
- Brand API: `GET` and `POST /api/v1/brand/workspaces/{campaignId}/reviews`.
- Creator API: `GET` and `POST /api/v1/creator/workspaces/{campaignId}/reviews`.
- The completed campaign workspace links to the same review screen for each signed-in role.
- OpenAPI documentation is available at `/api-docs/`, and four role-scoped requests are in `docs/postman/Influencer-Marketing.postman_collection.json`.

Example request body:

```json
{
  "revieweeUserId": "approved-participant-user-uuid",
  "rating": 5,
  "comment": "Clear communication and a smooth collaboration."
}
```

`comment` may be omitted or blank. A second review from the same participant to the same recipient returns a conflict; the unique database key also protects against concurrent duplicate submissions.

## Apply and use

1. Confirm `backend/.env` points to the intended local MySQL database. Keep its password in that file.
2. From the project folder, run `npm.cmd run db:migrate`. This applies the new schema and procedure file through the migration runner.
3. Start the app with `npm.cmd run dev` if it is not already running.
4. Sign in as the Brand owner of a completed campaign or as one of its approved Creators.
5. Open **My campaigns**, open the completed campaign workspace, then choose **Write or view campaign reviews**.
6. Submit a rating. The recipient can sign in and view the review from the same completed campaign workspace. Try a second submission for the same participant pair; it should be rejected.

To confirm the API definitions, open `http://localhost:4000/api-docs/` and find the **Reviews** operations. A campaign that is still in progress, a nonparticipant, an inactive account, or an unrelated recipient must not be able to read or submit a review.

## Module completion boundary

This task covers campaign reviews and ratings only. Conversations, messages, notifications, email reminders and live delivery are later Module 10 tasks. This note describes the implemented behavior; it does not claim a live MySQL migration or end-to-end walkthrough has been run in every environment.
