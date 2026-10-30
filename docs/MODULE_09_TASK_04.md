# Module 09 Task 4 — Refunds, failures and payment review

The selected local Test Mode policy is implemented:

- Owning active Brand can request a full refund for a captured, cancelled campaign before Creator earnings are released.
- Partial refunds and requests after earnings release go to Super Admin manual review. They never automatically claw back Creator earnings.
- Pending/uncertain refund requests and open review cases block new earnings release for that campaign.
- Only a verified provider `processed` refund changes wallet balances. Pending, failed and uncertain results retain held funds.
- Original funding/release journals remain immutable. A confirmed full refund posts a balanced Brand-held DEBIT and processor-clearing CREDIT.

## How to check

1. Run `npm run dev` and sign in as the Brand.
2. Fund an INR campaign in Razorpay Test Mode, then cancel it before Creator earnings release.
3. Open the campaign funding page or campaign workspace and select **Refunds & payment review**.
4. Enter a refund reason, choose **Review full refund**, and confirm the displayed full principal. Refunds return to the original test payment; recipients/amounts cannot be changed in this action.
5. Use **Check refund status** after pending/failed/uncertain results. A repeated create request reuses the saved intent and never sends another refund. When status becomes **Refund processed**, the Brand wallet shows a `Processed refund` debit.
6. For partial or post-release requests, enter the INR amount and explanation under **Request manual review**. Only one open policy request per campaign funding is created, including concurrent/repeated requests.
7. Super Admin → **Payment reviews** shows cases, revisions and retained notes. Save a note or decline a policy exception with a reason. Brand/Creator cannot access this queue or make Admin decisions.

Manual review is a case-and-notes workflow, not an authorization to issue arbitrary refunds. There is no automatic approval/execution for partial or post-release exceptions. These require separately agreed financial adjustments and provider reconciliation. Unexpected provider refunds stay open, block release and cannot be dismissed as ordinary policy requests. Wallets warn that recorded ledger totals may differ from the provider while these exceptions remain unresolved. Bank payouts, automatic partial/post-release reversals and a full chargeback/dispute-management system are outside this selected workflow.

## Reliability and provider setup

The provider request uses a server-reserved UUID as receipt and `X-Refund-Idempotency`, an exact full-principal amount and normal speed. A durable reservation commits before the external request. Only its first request can call refund creation; duplicates return the existing record. On timeout or invalid/ambiguous response, it becomes `SETUP_REVIEW`. Status checks fetch the stored refund and enumerate provider refund history to recover the matching receipt without creating another request. Failed refunds also require checking/manual review before a separate provider action. No automatic new refund is issued after failure or uncertainty.

Provider references, payment, currency, amount, receipt and saved source are checked server-side. Signed `refund.created`, `refund.processed`, and `refund.failed` notifications are supported at the existing raw-body webhook endpoint. The handler verifies HMAC and event identity/body hash, then fetches authoritative refund state. Delayed events cannot downgrade a processed refund. Invalid signatures, foreign identities and mismatches cannot post wallet debits. External/partial/mismatched-receipt refunds are retained as review cases rather than silently applied to the wrong principal.

Configure these three refund events on the existing Razorpay Test Mode webhook using the saved webhook secret. External delivery still requires a reachable HTTPS endpoint; localhost alone is insufficient. Provider-state changes made outside this application require webhook delivery or an explicit refund-status check to be observed. Webhook registration/deployment was not changed by this task.

Provider references: [Razorpay idempotent normal refunds](https://github.com/razorpay/markdown-docs/blob/master/api/refunds/normal-refunds-idempotent.md), [refund API SDK reference](https://github.com/razorpay/razorpay-python/blob/master/documents/refund.md), [refund webhooks](https://github.com/razorpay/markdown-docs/blob/master/webhooks/refunds.md).

## API and database

- Brand `GET /api/v1/brand/campaigns/:id/refunds` — eligibility, current refund, immutable status history, review cases.
- Brand `POST` same path — strict `{revision, reason}`; server determines amount/payment/receipt.
- Brand `POST /api/v1/brand/campaigns/:id/refunds/refresh` — empty body; read provider state and reconcile.
- Brand `POST /api/v1/brand/campaigns/:id/refunds/review` — `{amountMinor: "<paise>", reason}`; request review only.
- Admin `GET /api/v1/admin/payment-reviews?page=1&pageSize=10` — scoped paginated queue.
- Admin `POST /api/v1/admin/payment-reviews/:id/notes` — `{revision, action: "NOTE" | "DECLINE", reason}`.

Authentication/active status, role/ownership, strict input, no-store and browser mutation checks apply. Safe responses exclude secrets and customer payment details. Money uses integer paise and decimal strings. SQL additions 055–058 add campaign_refunds, refund_history, payment_review_cases and payment_review_notes. Shared financial/workflow locks serialize reservation, review changes, release and refund posting. Refund status/event/history/audit/ledger commit atomically; posting errors roll everything back for safe replay. Source identities and processed refunds cannot be edited/deleted; history/notes are append-only. The verifier now reconciles capture/release/refund journals and checks all 21 protection triggers.

## Verification and evidence

- 27 suites / 302 tests passed, including 13 real-MySQL refund workflow tests and two transport tests in disposable schemas.
- Checks cover success, pending, failed/late states, signed/forged/duplicate events, concurrent requests, ambiguous timeout/receipt recovery, ownership/role/origin/stale/strict validation, mismatched provider facts, manual review deduplication/notes/revisions, actual post-release refusal, pre-existing external refunds, rollback and SQL immutability/fabricated-post protection.
- Database: 58 tracked SQL files; wallet reconciliation and all 21 guards passed in the application database and the refunded disposable browser fixture.
- Read-only actual Razorpay Test Mode credential verification passed. No new actual provider order, payment, charge or refund was sent during verification.
- Browser verified a synthetic cancelled campaign refund of INR 1234.09 and a separate INR 25 partial-refund review with a retained Admin note. The provider was a deterministic fixture injected only into an ignored temporary server and disposable database. This is local workflow proof, not a claim of an actual Razorpay-processed refund.
- Screenshots: `../.local/screenshots/module-9-task-4-refund.png` and `../.local/screenshots/module-9-task-4-admin-review.png`.
- OpenAPI 0.9.4 and Postman include the new APIs. Build and browser checks passed; the existing bundle-size advisory remains.

Disposable browser schemas and temporary servers are removed after verification. Application wallet data is unchanged. Module 09 is complete for the selected local Test Mode workflow, with external webhook deployment, manual financial exceptions and bank-transfer setup explicitly separate.
