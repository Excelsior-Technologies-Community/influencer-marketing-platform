# Module 09 Task 1 — Payment setup and campaign funding

Implemented on 26 October 2026. The user selected **Razorpay Test Mode + INR**, with the saved campaign budget funded as principal. Commission, wallet accounting, payouts and refund policy remain later tasks. This task does not introduce real-money collection or live keys.

**Task 1 local workflow is complete and verified:** the saved Test Mode key pair authenticated successfully against Razorpay. An actual Razorpay Test Mode order and netbanking checkout completed, the server verified the checkout signature and fetched the captured payment, and the app displayed Funded (test). Reconciliation retained one funding audit and one captured attempt. No real money moved. External webhook delivery still requires a reachable HTTPS endpoint and dashboard configuration.

## Finish the account setup

1. In the Razorpay dashboard, use Test Mode and obtain the **key secret paired with the saved test key ID**. Add it after `RAZORPAY_KEY_SECRET=` in `backend/.env`, and save the file. Keep the value out of chat, source control and screenshots. If regenerating the pair, update both ID and secret together before creating any funding order.
2. The file also has `RAZORPAY_WEBHOOK_SECRET`, generated locally with cryptographically random bytes. Use this same value for the Test Mode webhook configuration. Do not replace it during event retries.
3. Run `npm run payments:verify`. It makes an authenticated, read-only Razorpay Orders request. Success creates no order or charge and displays no credentials. Missing setup or failed authentication exits unsuccessfully.
4. Restart the API after changing `.env` so it loads the saved values. Open the Brand funding page again.
5. To receive actual provider notifications, configure a reachable HTTPS webhook endpoint ending in `/api/v1/payments/razorpay/webhook`, with `payment.authorized`, `payment.captured`, `payment.failed` and `order.paid`. Localhost is not directly reachable by Razorpay. No public tunnel, deployment or dashboard webhook was created by this task. The signed webhook path is tested locally; checkout verification and authenticated status checking also reconcile payments.
6. Complete a genuine Razorpay **test** checkout and verify the server reports SUCCEEDED for a captured payment. Capture settings belong to the Razorpay Test Mode account; authorization alone remains pending. A configured flag means keys are present, not that authentication has passed.

Reference: [Razorpay Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [Orders API](https://razorpay.com/docs/api/orders/create/), [webhook validation and idempotency](https://razorpay.com/docs/webhooks/validate-test/), and [receipt lookup](https://razorpay.com/docs/api/orders/fetch-all/).

## Check in the application

1. Sign in as the owning Brand. Open **Campaigns → Manage campaign → Campaign funding**. Allocated campaign workspaces also link to funding.
2. Funding is available for APPROVED, LIVE, PAUSED, APPLICATION_CLOSED or IN_PROGRESS campaigns with an INR budget of at least ₹1. Draft, rejected, cancelled, expired and completed campaigns cannot start or reopen checkout. Historical payment reads and reconciliation remain available.
3. Choose **Fund campaign in test mode**, review the amount and continue to test checkout. The server uses the saved budget, not an amount sent by the browser. For example, INR 1234.09 becomes exactly 123409 paise in MySQL and Razorpay.
4. Complete checkout with Razorpay test payment details. A valid checkout signature is checked on the server, which also fetches the authoritative payment and checks identity, order, amount, currency and capture status.
5. After closing checkout, a failed attempt or a timeout, choose **Check payment status** before retrying. Failed attempts are retained; another attempt uses the same order. Closing checkout alone does not mark a payment failed.
6. Captured payment marks the campaign **Funded (test)**. Authorization stays pending. Funding does not complete the campaign, create Creator earnings, calculate commission or issue a payout.

## Persistence and failure handling

- `campaign_funding`: one durable reservation per campaign; exact integer principal in paise, INR, test public key ID, unique provider order, captured payment and state. CREATING → PENDING → SUCCEEDED; ambiguous setup failures use SETUP_REVIEW.
- `campaign_payment_attempts`: bounded private history of verified AUTHORIZED, CAPTURED and FAILED attempts. Customer bank/card/contact information and raw provider payloads are not stored.
- `campaign_payment_events`: unique provider event ID, exact raw-body hash, funding ID and event type. Signature verification precedes parsing. Reused event IDs with different bytes conflict.
- Order creation happens outside the database transaction after a durable reservation. Concurrent/repeated starts never create another order. An ambiguous failure is reconciled by the exact receipt, amount and currency. If there is no unambiguous matching order, the app keeps setup blocked for operator investigation rather than issuing a second order. Correcting invalid credentials does not silently discard an existing reservation.
- The original test key must be restored to reconcile orders created with it. Live key IDs fail closed. Key secrets/webhook secrets never leave server configuration or appear in responses/logs.
- Capture and its audit commit atomically under the existing shared lock order. Repeated callback/webhook/status checks cannot fund twice, and late failures cannot downgrade capture. Captured facts are still retained after campaign cancellation or Brand suspension, for later refund handling.
- Normal reads require the active owning Brand; Creator, admin and other Brand access is denied. Mutation origin/header checks apply to browser writes. Signed provider webhooks have their own authentication and retry behavior.

## API and setup commands

All paths are under `/api/v1`.

| Method | Path | Input |
| --- | --- | --- |
| GET | `/brand/campaigns/:id/funding` | Owned campaign, reservation, latest 100 attempts and configuration status |
| POST | `/brand/campaigns/:id/funding/order` | `{revision}`; current campaign revision |
| POST | `/brand/campaigns/:id/funding/verify` | `{razorpay_order_id,razorpay_payment_id,razorpay_signature}` from test checkout |
| POST | `/brand/campaigns/:id/funding/refresh` | `{}`; reconcile existing order and verified attempts |
| POST | `/payments/razorpay/webhook` | Exact raw JSON, `X-Razorpay-Signature`, `X-Razorpay-Event-Id` |

Brand requests require the Brand access token; POST additionally requires `X-Requested-With: InfluenceWeb` and an allowed Origin when supplied. Webhook authentication uses its HMAC signature instead. No endpoint accepts client-selected funding amount, currency, payment state or owner.

Apply `npm run db:migrate`, check `npm run db:verify`, and check account credentials with `npm run payments:verify`. SQL files 044–046 add three tables and the funding procedures without changing applied historical SQL. Swagger version 0.9.1 and Postman include the four Brand requests plus webhook documentation.

## Verification evidence

- **23 suites / 266 tests passed**, including 13 new real-MySQL funding tests using a deterministic Razorpay transport. This validates local logic and signature handling, not the actual configured Razorpay account.
- New tests cover role/ownership checks, inactive accounts, live-key rejection, integer amounts, stale revisions, client spoofing, shared-order concurrency, signature/provider mismatches, pending authorization, failures/retries, terminal capture, duplicate/conflicting/out-of-order webhooks, cancelled campaigns, receipt recovery, missing receipt and changed keys.
- Frontend production build passed with 117 modules. Existing bundle-size advisory remains.
- Database verification checks all 46 tracked SQL files, payment tables, constraints, rollback and readiness.
- Browser check: approved synthetic Brand campaign shows the saved INR budget, funding state, payment history and truthful missing-configuration message; checkout stays disabled. Screenshot: `.local/screenshots/module-9-task-1-funding-setup.png`. Synthetic demo records were removed afterward.
- **Actual account verification passed:** authenticated Orders API request, actual Test Mode order creation and checkout, server signature verification, captured payment fetch, Funded (test) screen and subsequent payment reconciliation. Captured test principal was INR 60000.50.
- External webhook delivery remains a deployment/configuration step; local signed webhook tests pass. Test order/payment remain in Razorpay Test Mode history; temporary MySQL demonstration records and accounts were removed.
- Updated screenshot: `.local/screenshots/module-9-task-1-funded.png`.
