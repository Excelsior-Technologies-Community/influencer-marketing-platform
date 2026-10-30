# Module 02 - complete: authentication and role access

Module 01 foundation and Module 02 are implemented and verified against the existing MySQL service. Campaign/profile business tools belong to later modules.

## Start and verify

```powershell
npm.cmd install
npm.cmd run setup:module2
npm.cmd run db:migrate
npm.cmd run db:verify
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Only run one project server on port 4000. If the backend is already running in another terminal, start only the frontend with `npm.cmd run dev -w frontend`.

Register: http://localhost:5173/register

Sign in: http://localhost:5173/login

Swagger: http://localhost:4000/api-docs/

## Manual browser checks

1. Register as Creator, then sign in. You should land on /creator with your own name/email and role access verified.
2. Sign out. Opening /creator should redirect to /login.
3. Register as Brand Admin with a company name and sign in. You should land on /brand. Opening /admin should return you to your own workspace.
4. Reload a signed-in page. The HttpOnly refresh cookie restores the session with a rotated token.
5. Request a password reset. In local development, open the matching JSON file under the ignored `.local/mail` folder and open its resetUrl. Set a new password, then sign in. The previous password and all previous sessions should fail. The reset link cannot be reused.
6. Swagger or Postman can verify /auth/me, /auth/users/{id}, the three /auth/access/* routes, rotation and logout. Use `X-Requested-With: InfluenceWeb` on every POST. Protected GETs need `Authorization: Bearer <accessToken>`. Postman manages refresh cookies automatically.

## Super Admin provisioning

Super Admin registration is prohibited on the public API. Create your own admin through the controlled local script. Run these commands from the project folder in PowerShell 7; the password prompt is masked:

```powershell
$taskAdminName = Read-Host 'Admin name'
$taskAdminEmail = Read-Host 'Admin email'
$taskAdminPassword = Read-Host 'Admin password (at least 12 characters)' -MaskInput
@{name=$taskAdminName; email=$taskAdminEmail; password=$taskAdminPassword} | ConvertTo-Json -Compress | node backend/scripts/create-admin.js
Remove-Variable taskAdminPassword
```

No default admin or shared password is seeded. Temporary verification accounts are removed after testing. Sign in with your supplied admin credentials to open /admin.

## Implemented endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/v1/auth/register | Transactional brand/creator identity and profile creation |
| POST | /api/v1/auth/login | Password verification, active account check and session creation |
| GET | /api/v1/auth/me | Current sanitized identity |
| GET | /api/v1/auth/users/:id | Own account; SUPER_ADMIN may inspect other accounts |
| GET | /api/v1/auth/access/super_admin | SUPER_ADMIN-only role check |
| GET | /api/v1/auth/access/brand_admin | BRAND_ADMIN-only role check |
| GET | /api/v1/auth/access/creator | CREATOR-only role check |
| POST | /api/v1/auth/refresh-token | Atomic token rotation, replay detection and family revocation |
| POST | /api/v1/auth/logout | Session-family revocation and cookie removal |
| POST | /api/v1/auth/forgot-password | Generic response and expiring reset delivery |
| POST | /api/v1/auth/reset-password | Atomic single-use reset and account-wide session invalidation |

## Security and storage

Passwords use asynchronous bcrypt. Inputs reject passwords above bcrypt's 72 UTF-8 byte limit. JWTs validate HS256, issuer, audience, expiry and token purpose. Access tokens stay in frontend memory. Refresh JWTs travel only through HttpOnly SameSite=Strict cookies (Secure in production), with hashes stored in MySQL. Every protected request rechecks session revocation, account status and authentication version. Logout immediately blocks corresponding access tokens. Reset blocks all existing sessions. Account and session procedures use locks/transactions and sensitive actions are audited. Roles and object ownership are checked on the server.

Refresh rotation invalidates the previous access session. Concurrent reuse revokes the family and requires signing in again; this fail-closed behavior is intentional. The frontend shares one refresh request among concurrent API retries and React startup checks.

## Email configuration

Local development without SMTP writes private reset email JSON files to `.local/mail`; these files are not served by the API and are ignored by Git. This local delivery path was tested end to end.

For actual inbox delivery configure EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD and EMAIL_FROM in backend/.env. Production auth rejects missing SMTP host/sender. SMTP sender credentials and provider deliverability are deployment configuration and were not verified against an external provider. Delivery failures produce a generic client response and a sanitized operational event to avoid exposing account existence.

## Database and test coverage

Modules 01–02 introduced five tracked SQL files; later modules add their own migrations. The initial files include: foundation tables/catalog seeds; auth_version columns; catalog procedure; authentication/session/reset procedures; login audit procedure update. Tests use MySQL and clean up only generated fixtures. Coverage includes all roles, duplicate email and rollback, privilege escalation, incorrect credentials, forged/expired/wrong-purpose/wrong-issuer/wrong-audience/wrong-algorithm tokens, ownership, suspension, refresh replay/concurrency, logout, CSRF origin/header checks, session expiry, reset hashing/expiry/reuse and session invalidation.

Swagger/OpenAPI and the Postman collection include implemented endpoints and their access/request rules. Foundation db:verify remains available. MySQL credentials and secrets stay in backend/.env and are never printed.

References: [bcrypt documentation](https://www.npmjs.com/package/bcrypt), [jsonwebtoken documentation](https://www.npmjs.com/package/jsonwebtoken).
