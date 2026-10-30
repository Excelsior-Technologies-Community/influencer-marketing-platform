# Quality Checks

Run these commands from the project root when you want to validate a local checkout:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run db:verify
```

The automated API suite includes MySQL integration checks. Some checks create disposable databases, so the configured MySQL account needs permission to create and drop those test databases. Do not point the suite at a database containing important records.

The frontend build produces deployable static assets under `frontend/dist/`. Database verification checks the configured application schema and does not create a persistent verification account.

For API exploration, import the [Postman collection](postman/Influencer-Marketing.postman_collection.json) and use local credentials and tokens in a private Postman environment. Payment requests require genuine Razorpay Test Mode responses; do not fabricate successful payment signatures.
