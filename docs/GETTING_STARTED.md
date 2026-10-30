# Getting Started

This guide sets up a local development environment for the Influencer Marketing Platform.

## Prerequisites

- Windows PowerShell, or a terminal with equivalent Node.js and MySQL commands
- Node.js 22.12 or newer and npm
- MySQL 8.0 or newer, running locally

## Install the application

From the repository root, install the dependencies:

```powershell
npm.cmd install
```

Copy `backend/.env.example` to `backend/.env`. Set the MySQL host, port, database name, username and password. Keep `.env` files private; Git ignores them.

Create the application database and a dedicated local user with the required migration and runtime permissions. A sample SQL statement is in the root [README](../README.md).

## Prepare MySQL and authentication

Run the database migrations and verify the installed schema:

```powershell
npm.cmd run db:migrate
npm.cmd run db:verify
```

Generate any missing local authentication secrets:

```powershell
npm.cmd run setup:auth
```

Create your Super Admin account from an interactive terminal:

```powershell
npm.cmd run setup:admin -w backend
```

Enter an account name, an email address not already registered, and a password of at least 12 characters. The password is hidden while typing. This utility creates an administrator in the configured MySQL database; it does not create a shared or default password.

Brand and Creator accounts can be registered through the application. Use inboxes you control if you want to receive email. Local notifications remain available without an SMTP provider.

## Start the application

```powershell
npm.cmd run dev
```

Open the web application at [http://localhost:5173](http://localhost:5173). The API is available at `http://localhost:4000`, with the API reference at [http://localhost:4000/api-docs/](http://localhost:4000/api-docs/).

The development API accepts loopback browser aliases (`localhost`, `127.0.0.1`, `[::1]`) at the configured frontend protocol and port. `CLIENT_URL` must match the web application origin.

## First-use workflow

1. Sign in as Super Admin and confirm the account, category, platform and content-type catalogs are appropriate.
2. Register a Brand and complete its company and billing profile.
3. Register a Creator and complete profile details. Add only social accounts and audience figures that you own and can substantiate.
4. As Brand, create a campaign draft, add realistic requirements and dates, and upload a brief.
5. Submit the campaign for Super Admin review. After approval and when the application window opens, publish it from the Brand workspace.
6. As Creator, find the live campaign, review its brief and apply.
7. As Brand, evaluate the application and allocate a Creator. Continue work through the campaign workspace.
8. For payment practice, configure Razorpay Test Mode only. Complete content approval and campaign workflow before releasing earnings to test wallets.

## Optional provider configuration

### Razorpay Test Mode

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in `backend/.env`. Keep the keys in Test Mode for local use. Never paste keys into source files, Postman examples or this repository.

### SMTP delivery

Configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD` and `EMAIL_FROM` in `backend/.env`. Do not store an email account password in source control.

## More information

- [System architecture](ARCHITECTURE.md)
- [Database diagram](ERD.md)
- [Deployment and operations](DEPLOYMENT_OPERATIONS.md)
- [API collection for Postman](postman/Influencer-Marketing.postman_collection.json)
