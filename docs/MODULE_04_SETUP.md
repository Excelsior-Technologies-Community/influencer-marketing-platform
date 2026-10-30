# Module 04 - complete: Brand profile and workspace

Module 04 implements the Brand Admin's private company profile, contact information, social links, billing details and company logo. Data persists in the existing MySQL database. Each Brand only accesses its own profile and logo.

## Start and verify

```powershell
npm.cmd install
npm.cmd run db:migrate
npm.cmd run db:verify
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Run only one development backend/frontend on ports 4000 and 5173. If your project servers are already running, reuse them; the backend and Vite watch changes automatically.

Register as Brand Admin at http://localhost:5173/register if needed, then sign in at http://localhost:5173/login. The Brand workspace opens at http://localhost:5173/brand.

## Completed screens

- **Overview:** current company name/logo/industry/location, actual profile readiness, billing-readiness indicator, account identity/status and links to unfinished profile fields.
- **Company profile:** company name, industry, website, location, contact name/email/phone, description and Instagram/Facebook/YouTube links. Save confirmation and validation/error feedback are included.
- **Company logo:** upload, display, replace and remove a private logo. PNG/JPEG/WebP files up to 2 MiB are accepted after content, MIME, extension, dimension and animation checks. Images are re-encoded to WebP within 512x512 and served only through an authenticated Brand request.
- **Billing details:** billing company/name/email, tax/GST identifier and address. These values are stored for future billing; this module does not calculate tax, create invoices or take payments.

Profile readiness counts company name, contact email, phone, website, industry, description, location and logo. Billing readiness checks billing name/email/address line 1/city/country. These indicators describe the completeness of saved fields, not campaign eligibility or payment approval. Campaign budgets, applicants, submissions and performance metrics arrive with their owning modules.

## Manual browser checks

1. Sign in as Brand Admin. Overview must show the company name entered during registration and the sign-in email.
2. Open Company profile, enter contact/company/social details, and click Save company profile. Refresh the page; saved values must remain. The login email stays unchanged.
3. Choose a valid PNG/JPEG/WebP file and click Upload logo. Confirm the image appears. Replace/remove it and verify that company and billing details remain intact.
4. Try a non-image, wrong file extension or file above 2 MiB. Validation must reject it without replacing the existing logo.
5. Open Billing details, fill the company/contact/address fields, save, refresh and confirm persistence. Company/social values and the logo must remain intact.
6. Open the same company form in two tabs. Save a company change in one, then save from the old tab. It must return a conflict instead of overwriting the newer data. Use Reload latest profile (discard changes) to fetch the current record.
7. Create/sign in as a second Brand. It must see only its own profile/billing/logo. Supplying another brandId/userId in JSON/query or requesting a profile by ID must be rejected.
8. Creator and Super Admin credentials cannot use the Brand owner's API or route. Super Admin continues to inspect company data through its own admin APIs.
9. Suspend the Brand through Module 03 while it is signed in. Its profile/logo requests must immediately fail until an administrator reactivates it and it signs in again.

## Implemented APIs

All endpoints use Bearer authentication and require active BRAND_ADMIN. Mutations also require `X-Requested-With: InfluenceWeb` and an allowed browser Origin. All responses are private with Cache-Control: no-store. No brand ID can select another owner's data.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/v1/brand/dashboard | Current profile and readiness indicators |
| GET | /api/v1/brand/profile | Own company/contact/social/billing details and safe logo metadata |
| PUT | /api/v1/brand/profile | Full editable profile replacement with current revision |
| GET | /api/v1/brand/profile/logo | Authenticated WebP image bytes |
| POST | /api/v1/brand/profile/logo | Multipart logo upload/replacement with logoRevision |
| DELETE | /api/v1/brand/profile/logo | Remove logo with current logoRevision |

PUT requires companyName and revision. Send all editable fields to preserve optional values, since omitted optional fields are cleared/defaulted. Writable fields: companyName, website, industry, description, contactName, contactEmail, phone, location, socialLinks and billing. Identity, account email, status, IDs, role and verification are read-only.

Example PUT body:

```json
{
  "companyName": "Example Brand",
  "website": "https://example.com",
  "industry": "Technology",
  "description": "Our company introduction.",
  "contactName": "Company contact",
  "contactEmail": "hello@example.com",
  "phone": "+91 98765 43210",
  "location": "Ahmedabad, India",
  "socialLinks": {"instagram": "https://instagram.com/example", "facebook": null, "youtube": null},
  "billing": {"name": "Example Brand", "email": "billing@example.com", "taxId": null, "addressLine1": "Company address", "addressLine2": null, "city": "Ahmedabad", "state": "Gujarat", "postalCode": "380001", "country": "India"},
  "revision": 0
}
```

Read revision from GET profile before a PUT. Successful saves increment it. Logo requests use the separate logoRevision field as multipart `revision` or DELETE JSON `revision`. Logo revisions stay monotonic through removal/replacement, protecting against old requests from another tab. Profile edits and logo edits have independent counters.

URLs accept HTTP/HTTPS without embedded credentials. Unknown fields, unsafe URLs, malformed email/phone, oversized text and invalid revisions return 422. Stale revisions return 409. Other roles return 403. Suspended/revoked sessions return 401. Missing logo returns 404. Oversized image returns 413.

## Database and storage

`008_brand_profiles.sql` creates brand_profiles and brand_logos. Extended contact/social/billing data lives in validated JSON owned by brand_id. Small, re-encoded logo bytes and their hash/type/size/dimensions/revision live in brand_logos. Foreign keys cascade owned profile/logo rows if a generated test Brand is removed.

`009_brand.sql` implements sp_get_brand, sp_update_brand, sp_get_brand_logo, sp_save_brand_logo and sp_delete_brand_logo. Writes recheck active Brand ownership, lock user/brand rows, compare revisions, and commit changes/audits atomically. Registration already creates the base brand in Module 02; no redundant brand-creation endpoint is added. Existing Brands without extended rows read normalized empty fields and can save normally.

The local logo storage is MySQL-backed and does not require Cloudinary/S3 credentials. It is deliberately bounded to small company logos. A future media-storage adapter can move these assets to object storage while keeping the authenticated API contract. Uploaded original names and EXIF are not retained; image bytes and private billing/contact values are not copied into audit logs.

The database now contains 13 required tables and 9 tracked SQL files. Earlier applied migration files were preserved.

## Documentation and verification

Swagger: http://localhost:4000/api-docs/

Postman: import `docs/postman/Influencer-Marketing.postman_collection.json`, sign in as Brand Admin and use the Brand workspace folder. GET profile stores profile_revision and logo_revision. Populate profile_json with the editable snapshot before PUT. Uploads use file field logo and text field revision; downloaded images are binary, so do not parse them as JSON.

Tests verify profile/billing persistence, shared company visibility in the admin panel, immutable identity fields, owner isolation, database ownership checks, stale/concurrent edits, independent monotonic revisions, valid PNG/JPEG/WebP decoding, image re-encoding, byte/MIME/extension validation, corrupt/oversized images, multipart bounds, authenticated delivery, logo removal, suspension and safe audit metadata. All previous module tests are included.

Temporary browser/test accounts and their owned profile/logo rows are removed after verification. Existing user data is retained.

Implementation references: [Multer documentation](https://expressjs.com/en/resources/middleware/multer/), [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/), [Sharp metadata](https://sharp.pixelplumbing.com/api-input/).
