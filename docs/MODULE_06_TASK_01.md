# Module 06 Task 1 — Campaign Creation and Editing

Implemented: Brand campaign drafts with title, description, total planning budget/currency, creator slots, requirements, platforms, categories, content types and per-creator deliverables. MySQL persistence, normalized catalog links, ownership, validation, atomic writes/audits and revision conflict protection are included.

## Setup and use

1. Keep existing credentials in ignored `backend/.env`. Run `npm.cmd run db:migrate`, then `npm.cmd run db:verify`.
2. Reuse existing servers or start `npm.cmd run dev` once.
3. Sign in as Brand Admin → **Campaign drafts** → **Create campaign**.
4. Enter a title and explicitly choose currency. Other planning fields can be completed later; slots default to 1. Save a draft.
5. Choose up to 10 platforms, categories and content types. Super Admin maintains catalog availability.
6. Add deliverables using selected platform/content-type pairs, quantity per creator and optional notes. One row per pair; at most 20 rows. Remove the matching deliverable before unselecting its platform/content type in the form.
7. Save, reload, reopen from the paginated own-draft list, edit and save again. Check that amount, selections and deliverables persist.

Drafts remain private to their Brand. They are not submitted or published by saving. This task includes the minimal list required to resume edits. Full lifecycle listing/filtering, approval, publishing, cancellation and deletion are later tasks.

## Fields and limits

- Title: trimmed 3–160 characters, required. Description: nullable, at most 5000. Requirements: nullable, at most 3000.
- Currency: explicitly choose INR, USD, EUR or GBP. No currency is inferred from location.
- Total campaign budget: optional decimal **string**, positive, up to 999999999.99, maximum two decimals; MySQL DECIMAL(11,2), returned as a string. Blank/null means unplanned; zero/negative/scientific/comma-formatted amounts are rejected. This planning field does not implement funding, fees or payouts.
- Creator slots: integer 1–10000. Selected catalog IDs must be unique positive integers; up to 10 per group.
- Deliverable: selected platform ID, selected content-type ID, quantity 1–100 **per creator**, nullable notes up to 1000. Duplicate pairs and references outside the selected lists are rejected.
- New choices must be active; categories also require an active parent. Previously selected unavailable choices can be retained or removed and are labeled accordingly. Future submission checks must revalidate availability.

## API and MySQL

- GET `/api/v1/brand/campaigns?page=1&pageSize=10`: own DRAFT rows, newest update first; maximum pageSize 50.
- GET `/api/v1/brand/campaigns/catalogs?campaignId=...`: active choices plus optional owned campaign's existing unavailable choices.
- POST `/api/v1/brand/campaigns`: create, 201. Required `title`, `currency`; all other planning fields optional.
- GET `/api/v1/brand/campaigns/:id`: own main fields, choice metadata/IDs and deliverables.
- PUT same item URL: full replacement of editable fields plus latest numeric `revision`. Omitted optional fields/lists clear to defaults. Name/status/owner/IDs are not accepted. Only DRAFT is editable.

Active BRAND_ADMIN authentication required. Mutations require `X-Requested-With: InfluenceWeb` and allowed Origin. Strict queries/bodies block ownership/status injection. Foreign IDs return 404, stale/non-draft writes 409, invalid fields/catalogs 422. Responses are no-store. Reload after conflict discards local edits.

Tables: `campaigns`, `campaign_platforms`, `campaign_categories`, `campaign_content_types`, `campaign_deliverables`. Brand FK retains explicit ownership; deleting unrelated identities does not cascade away campaign history. Child draft rows cascade only with campaign deletion. Procedures: `sp_get_campaign`, `sp_get_campaigns`, `sp_campaign_catalogs`, `sp_save_campaign_draft`. Writes coordinate catalog/user/Brand locks and commit all fields/links/deliverables/audits together. Audit metadata contains revision/counts, not briefs or budget amounts.

128 tests across 11 suites passed, including 11 actual-MySQL campaign draft checks for exact decimals, nullable drafts, persistence/clearing, roles/ownership, pagination, invalid fields/references, rollback, concurrent saves, inactive choices, draft-only editing, suspension and safe audits. Swagger/Postman document the implemented APIs.

Task 2 brief uploads and scheduling is complete; see MODULE_06_TASK_02.md. Task 3 approval is complete; see MODULE_06_TASK_03.md. Task 4 lifecycle/management is complete; see MODULE_06_TASK_04.md. Module 06 local management is complete.
