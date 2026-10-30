# Module 09 Task 3 — Commission and Creator test-wallet release

Implemented policy selected by the project owner:

- Divide captured campaign principal equally among approved, allocated Creators.
- Deduct 10% commission from each gross share; net earnings credit Creator test wallets.
- Owning Brand explicitly releases after campaign completion and latest-version content approvals.
- Bank transfers require separate provider and beneficiary setup. No bank payout is claimed.

Whole-paise arithmetic: shares round down, with leftover paise assigned in allocation time/application ID order. Commission rounds down per Creator. Thus gross = net + commission exactly; gateway fees are not deducted. For INR 1234.09 and two Creators, gross shares are 617.05/617.04, commission 61.70 each, and net earnings 555.35/555.34. A share below one paise blocks the entire release. Inactive Creators also block release until reactivated.

## How to check

1. Start the application with `npm run dev`; use the normal Brand and Creator accounts.
2. Brand: fund an INR campaign in Razorpay Test Mode, allocate every Creator slot, approve all required content at its latest version and complete the campaign.
3. Open **My campaigns → workspace → Creator earnings & commission**, or the same link on the campaign funding page.
4. Check each Creator's gross share, commission and net earnings. Choose **Review release**, then **Confirm test-wallet release**.
5. The page displays **Earnings released**. Brand **Wallet & payments** shows the principal debit. Each Creator's **Earnings & history** shows only their net credit, gross share and commission.
6. Reload or repeat the same API request: no additional earnings, commission or debit is created. Pending funding, missing reviews, incomplete/cancelled campaigns, inactive Creators and stale revisions cannot initiate release.

## API and persistence

`GET /api/v1/brand/campaigns/:id/earnings-release` returns an owner-only preview/readiness and recorded result. `POST` to the same path accepts only `{ "revision": <current campaign revision> }`; amounts, recipients and commission cannot be supplied by clients. Authentication, Brand ownership, no-store responses, mutation origin/header and strict validation apply. Money is returned as decimal paise strings.

SQL additions 052–054 preserve applied migrations. A unique `(funding_id,event_type)` allows one capture and one release. A release journal debits Brand-held funds for the full principal and credits each Creator's net plus the platform commission account. Immutable release snapshots retain gross/commission/net and allocation order. Posting validates captured funding, completion, latest approvals, expected recipients, entries and balanced totals. All entries, snapshots and the audit commit together under the shared financial/workflow lock; failure rolls everything back. Concurrent/repeated requests reuse the posted journal. Capture reconciliation and legacy backfill remain idempotent after release.

Refunds/disputes and reversals remain Task 4. Posted journals and snapshots cannot be edited/deleted to simulate refunds. Test-wallet release does not call RazorpayX or transfer money to a bank.

## Verification

Eight dedicated real-MySQL integration tests run in disposable schemas: exact split/remainder/commission, large and small amounts, release history, duplicate/concurrent release, capture replay/backfill, completion/capture/review gates, ownership/roles/origin/validation, inactive Creators, fault rollback and immutability. Financial test data never credits application wallets. `npm run wallets:verify` checks captures and releases, exact commission/net ownership, balance and all 13 protection triggers. Database verification checks all 54 SQL files.

Browser verification uses a disposable, explicitly synthetic completed campaign and captured source (no external payment). The Brand release was confirmed through the UI; screenshot: `../.local/screenshots/module-9-task-3-release.png`. The Creator view also verified a single INR 555.35 net credit, INR 617.05 gross and INR 61.70 commission; screenshot: `../.local/screenshots/module-9-task-3-creator-earnings.png`. Both disposable databases and temporary servers were removed after checking. This verifies the local release workflow and makes no claim of a bank transfer or additional live provider capture.

Final checks: **25 suites / 287 tests passed**; frontend production build passed (119 modules; existing bundle-size advisory); application and released-fixture wallet reconciliation passed; database verification passed (54 SQL files). OpenAPI 0.9.3 release paths and Postman JSON verified.
