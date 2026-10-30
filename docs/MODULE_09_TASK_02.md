# Module 09 Task 2 — Wallet and transaction history

Completed locally on 26 October 2026. Razorpay Test Mode and INR remain the selected setup. Task 2 adds immutable balanced ledger entries, captured funding credits, private balances and paginated history. Commission, Creator allocation, payouts and refunds remain Tasks 3–4.

## Check in the app

1. Sign in as a Brand and open **Wallet & payments** from the sidebar. The three cards show **Campaign funds held**, total received and total debited. These are test campaign funds, not a withdrawal balance.
2. Fund an approved/active INR campaign using the existing Razorpay Test Mode flow. Once the server confirms capture, return to the wallet and reload. A captured principal of INR 1234.09 adds exactly 123409 paise and one **Received** transaction.
3. Open **Wallet transactions** to view the campaign, timestamp, direction, exact amount and journal reference. Filter by received/debited and UTC dates, or paginate. Campaign links open the owned funding detail.
4. Open **Payment attempts** to see verified authorized, captured and failed attempts across your campaigns. Filter by status/date. Pending authorization and failed attempts never create wallet credits. An order without a verified attempt remains on its campaign funding page.
5. Sign in as a Creator and open **Earnings & history**. Only that Creator's own posted earnings would count. The balance starts at zero: campaign budgets, approved content and Brand funding do not allocate earnings automatically. Allocation/commission rules are implemented separately in Task 3.

Each account sees its own records. Other Brand/Creator records and the internal processor clearing account are excluded. Inactive accounts cannot read wallets. There are no user-controlled credit, debit, transfer or payout endpoints.

## Ledger behavior

- Every captured principal creates one journal with a Brand held-funds CREDIT and an equal processor clearing DEBIT. The journal must contain exactly two matching entries and valid captured source proof before it can be POSTED.
- Capture, payment attempt/event, funding state, wallet entries and audit commit in the same MySQL transaction. A posting error rolls all of them back. Later callback/webhook/status retries can safely succeed once the error is resolved.
- One funding source can create only one journal. Repeated/concurrent checkout verification, webhook delivery and reconciliation cannot credit twice. Late failure notifications do not undo capture. Existing raw-body HMAC, unique event/body-hash checks and authoritative provider fetches remain in force.
- MySQL triggers reject updates/deletes of posted journals/entries, new entries into posted journals, account identity changes and mutation/deletion of captured financial source proof. Future corrections must be new compensating journal entries after the relevant workflow is implemented, never edits to posted entries.
- Balances are calculated from POSTED ledger entries, not a mutable cached balance. All API amounts, including aggregates, are decimal strings of integer paise. The UI formats them with BigInt, with no floating-point financial calculations.
- Migration 051 backfills previously verified successful funding once, retaining exact principal and original payment history. The journal posting date is the backfill date; original verified payment timing remains in payment history. Missing source proof fails rather than inventing a credit.
- Captured facts remain recordable after campaign cancellation or Brand suspension. Refunds/disputes do not disappear from history; their compensating workflows remain Task 4.

## API

All paths are under `/api/v1`, require the matching role's Bearer token, and return `Cache-Control: no-store`.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/brand/wallet` | Owned test held-funds summary |
| GET | `/creator/wallet` | Owned test Creator earnings summary |
| GET | `/brand/wallet/transactions` | Owned posted entry history |
| GET | `/creator/wallet/transactions` | Owned posted earnings entry history |
| GET | `/brand/wallet/payments` | Owned verified payment-attempt history |

Summary returns `data.wallet`: `balanceMinor`, `creditsMinor`, `debitsMinor` as paise strings, `transactionCount`, `balanceKind`, `currency: INR`, `mode: TEST`.

History accepts `page` (1–100000), `pageSize` (1–50), optional `campaignId`, `from` inclusive and `to` exclusive ISO instants with offsets. Transactions optionally filter `direction=CREDIT|DEBIT`; payment attempts use `status=AUTHORIZED|CAPTURED|FAILED`. Unknown inputs, invalid dates/ranges and invalid bounds are rejected. Foreign campaign filters return no owned records. UI dates are UTC whole-day boundaries, with the selected To date included.

## Database and verification

New append-only SQL files 047–051 add `wallet_accounts`, `wallet_journals`, `wallet_entries`, 10 financial protection triggers, internal posting/backfill procedures, atomic funding integration and role-scoped read procedures. Applied historical SQL files were not changed. The posting/backfill helpers are not exposed through the procedure repository or HTTP.

Run:

```powershell
npm run db:migrate
npm run db:verify
npm run wallets:verify
npm test
npm run build
```

`wallets:verify` reads a consistent snapshot and checks balanced journals, source capture proof, owner/clearing entries, duplicate-source constraints and installed protection triggers without printing private balances or credentials. Swagger is version 0.9.2; Postman has the five wallet/history requests.

Payment tests run against uniquely named disposable MySQL schemas. They drop those entire schemas after verification instead of deleting posted journals or disabling financial protections in the application database. Test database creation privileges are required for these two suites; application data is untouched.

Verification: **24 suites / 279 tests passed**, including 13 wallet tests covering exact zero/large amounts, balanced posting, ignored authorization/failure, signature mismatch, concurrent/replayed/out-of-order confirmations, atomic rollback, SQL immutability, unbalanced/fabricated journal rejection, multiple legacy backfills, owned filters/pagination, inactive accounts and absence of client credit/debit routes. Production build passed with 118 modules; the existing bundle-size advisory remains. Database verification checks 51 tracked SQL files.

Reference for provider signature validation, duplicate event IDs and unordered delivery: [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/).


## Browser verification and screenshots

The browser check used a disposable database and temporary API/frontend ports 4001/5174 so posted test journals could be removed by dropping the whole test schema, without deleting financial rows or disabling protections in the application database. Normal application servers were left running.

An actual Razorpay sandbox attempt remained in provider processing and did not create a wallet credit. The positive UI scenario therefore used an explicitly named deterministic wallet test fixture in that disposable schema, through the signed checkout/webhook verification service. It showed exactly INR 1234.09 held, one Received journal, zero debited, and captured/failed attempts separately. Debit/status filtering worked. A different Creator account showed INR 0.00 and no foreign entries. Ledger reconciliation passed for both the fixture database and the application database. Temporary servers were stopped and only the disposable schema was dropped afterward; Razorpay Test Mode attempt history remains with the provider. Actual external webhook delivery still requires HTTPS setup.

Screenshots (isolated test data):

- `.local/screenshots/module-9-task-2-brand-wallet.png`
- `.local/screenshots/module-9-task-2-payment-history.png`
- `.local/screenshots/module-9-task-2-creator-earnings.png`
