# Module 05 Task 1 — Creator Profile Management

Completed: private Creator profile editor with live preview and MySQL persistence for bio, location, languages, skills and catalog categories. Name, sign-in email, account status and verification status cannot be changed by this endpoint.

## Setup and check

1. Keep your existing MySQL credentials in ignored `backend/.env`.
2. Run `npm.cmd run db:migrate`, then `npm.cmd run db:verify`.
3. Run `npm.cmd run dev` once. Reuse existing servers if ports 4000/5173 are occupied.
4. Register/sign in as a Creator and open `http://localhost:5173/creator` (also `/creator/profile`).
5. Enter bio, location, comma-separated languages and skills. Select categories; Super Admin manages available catalog entries.
6. Click **Save creator profile**. Check the success notice and preview, then reload to confirm persistence.

Blank bio/location clear those values. Empty language/skill/category lists clear selections. Languages/skills are trimmed and must be unique ignoring case. Limits: bio 3000 characters; location 160; 10 languages; 20 skills; each language/skill 2–60 characters; 10 category IDs. Duplicate/invalid categories are rejected. Already selected unavailable categories may be retained or removed, but cannot be newly selected.

## APIs

- `GET /api/v1/creator/profile`: authenticated Creator's own profile and revision.
- `PUT /api/v1/creator/profile`: full replacement of editable fields plus the last loaded numeric `revision`. Missing editable fields clear to their defaults. Requires Bearer access token and `X-Requested-With: InfluenceWeb`.
- `GET /api/v1/creator/profile/categories?q=&page=1&pageSize=50`: searchable, paginated catalog choices and selected state; pageSize at most 100.

PUT body: `bio`, `location`, `languages`, `skills`, `categoryIds`, `revision`. Unknown fields and attempts to edit another account or change identity/verification are rejected. A stale/concurrent save returns 409; reload the latest profile before retrying. Reload discards unsaved edits.

Stored procedures: `sp_get_creator`, `sp_update_creator`, `sp_get_creator_profile_categories`. New tables: `creator_profiles`, `creator_categories`. No uploaded files or provider credentials are involved in this task.

## Validation

`npm.cmd test`: 80 tests across 6 suites, including 13 actual-MySQL Creator profile checks for persistence, roles/ownership, input validation, inactive categories, rollback, simultaneous saves, suspension, mutation protection and safe audit data. `npm.cmd run build` and MySQL verification pass. Swagger and Postman document the implemented endpoints.

Task 2 social accounts is complete; see MODULE_05_TASK_02.md. Task 3 uploads is complete; see MODULE_05_TASK_03.md. Task 4 Creator dashboard is complete; see MODULE_05_TASK_04.md. Module 05 is not fully complete.
