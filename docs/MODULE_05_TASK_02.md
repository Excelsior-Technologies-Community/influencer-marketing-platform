# Module 05 Task 2 — Social Account Management

Completed: Creator social account CRUD at `/creator/social-accounts`, linked from the role-specific sidebar. Saves are private to the active Creator. Task 1 profile fields and verification status remain independent.

## Setup and usage

1. Run `npm.cmd run db:migrate`, then `npm.cmd run db:verify` using existing credentials in ignored `backend/.env`.
2. Reuse running servers or start `npm.cmd run dev` once.
3. Sign in as Creator, open **Social accounts**, choose a platform and enter username/public HTTPS profile URL.
4. Optionally enter followers/subscribers, average views and engagement rate. Add, reload, edit and save to check persistence.
5. Remove a link using **Remove**, then **Confirm removal**. The account at the provider is unaffected.

One account per platform per Creator; maximum 20. New accounts require active catalog platforms; existing unavailable-platform accounts stay editable/removable. An account's platform cannot change: remove/add instead. Super Admin manages platforms.

Username: 1–100 letters/numbers/dots/underscores/hyphens; leading @ is removed. HTTPS URLs at most 2048 characters, without credentials/custom ports/private literal IPs. Known Instagram/Facebook/YouTube URLs must match the provider domain. Links are stored and never fetched by the backend. Counts: integers 0–1,000,000,000,000; engagement rate 0–100, up to two decimals. Blank metrics mean unknown (null); zero remains zero.

## Metric provenance and provider setup

All metrics are **self-reported**, not provider verified. API `metricsSource` is always `MANUAL`, `isVerified` always false. `metricsReportedAt` records the save time when any metric is supplied; clearing all metrics clears this time. Ownership of the external account is unverified. No passwords/access tokens/refresh tokens are accepted or stored. Provider OAuth, encrypted provider-token storage and synchronization require provider configuration and are not simulated.

## API

- GET `/api/v1/creator/social-accounts`: own accounts and platform choices (active plus own inactive).
- POST same URL: `{platformId, username, profileUrl, followersCount?, averageViews?, engagementRate?}`; 201.
- PUT `/api/v1/creator/social-accounts/:id`: `{username, profileUrl, followersCount?, averageViews?, engagementRate?, revision}`; full replacement, omitted metrics clear.
- DELETE same item URL: `{revision}`.

All require active CREATOR authentication. Mutations require `X-Requested-With: InfluenceWeb` and an allowed Origin. Strict bodies/queries reject ownership/verification/token injection. Missing/foreign IDs return 404; duplicates/stale revisions return 409. Reload after conflict; local edits are discarded.

MySQL table: `creator_social_accounts` with owner/platform foreign keys, unique creator/platform and monotonic revision. Procedures: `sp_get_creator_social_accounts`, `sp_save_creator_social_account`, `sp_delete_creator_social_account`. Transactions coordinate with catalog/status locks, enforce ownership and audit changes without handles, URLs or metric values.

Swagger/Postman cover all four operations. Actual-MySQL tests cover persistence, nullable/zero metrics, role/ownership, duplicate races, stale concurrent edits/removal, unsafe inputs, inactive platforms, suspension, mutation protection, provenance and audit privacy. Task 3 uploads is complete; see MODULE_05_TASK_03.md. Task 4 is complete; see MODULE_05_TASK_04.md.
