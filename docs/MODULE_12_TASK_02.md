# Module 12 Task 2 — Security and regression verification

## Coverage

This task rechecks security behavior at API boundaries and across high-risk workflows, using existing tests rather than duplicating their coverage:

- **Origins and browser requests:** development loopback aliases, exact production origins, rejected foreign origins, credentialed CORS, preflight, and required mutation headers (`backend/tests/origins.test.js`).
- **API safety:** Helmet headers, no framework disclosure header, malformed/oversized JSON handling, generic database failure responses, request IDs, unknown routes, and authentication throttling (`backend/tests/health.test.js`).
- **Identity inputs:** public Super Admin registration is blocked; unexpected credential fields and bcrypt-truncated passwords are rejected; password hash verification is checked (`backend/tests/auth-setup.test.js`).
- **Authorization/regression:** three-role campaign workflow and access denial (`backend/tests/full-workflow.integration.test.js`); Brand/Creator ownership, funding, wallet immutability, payout and refund authorization/idempotency (`backend/tests/campaign-funding.integration.test.js`, `wallet.integration.test.js`, `creator-releases.integration.test.js`, `refunds.integration.test.js`).
- **Payment transport:** signed/refund gateway request handling (`backend/tests/refund-gateway.test.js`).

## Results

- Focused security and workflow run: 8 suites, 64 tests passed.
- Authentication input/password run: 1 suite, 6 tests passed.
- Total for this task: 9 suites and 70 tests passed.
- MySQL integration tests use randomly named disposable schemas and drop them after each suite. Provider/payment cases use synthetic fixtures and do not move real money.

## Run again

From the project root:

```powershell
npm.cmd run test -w backend -- --runTestsByPath tests/health.test.js tests/origins.test.js tests/refund-gateway.test.js tests/full-workflow.integration.test.js tests/campaign-funding.integration.test.js tests/wallet.integration.test.js tests/creator-releases.integration.test.js tests/refunds.integration.test.js
npm.cmd run test -w backend -- --runTestsByPath tests/auth-setup.test.js
```

The MySQL integration cases require the configured account in `backend/.env` to create and drop disposable databases. Keep credentials in that file and out of terminal transcripts or chat.

## Scope

This is a focused security/regression pass, not a claim that every test in the repository or a production penetration test has passed. Live SMTP, external webhook delivery, bank transfers, production hosting and infrastructure security remain environment/deployment checks.
