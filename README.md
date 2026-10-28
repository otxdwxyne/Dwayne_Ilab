# Jirani Play v2 — Kenya Grassroots Football

A full-stack starter for discovering grassroots football clubs across Kenya and submitting club listings for moderation.

## What's new in v2
- Responsive frontend focused exclusively on football.
- Search by club, town, county and description.
- County and age-group filters with server-side pagination.
- Registration form with validation, consent checkbox and public/private contact fields.
- PostgreSQL database via Prisma ORM.
- Club submissions default to `PENDING`; only approved listings are public.
- Admin login with bcrypt password hashes, session rotation, HTTP-only cookies and CSRF token checks.
- Admin endpoints for listing pending clubs, approving/rejecting, featuring and deleting clubs.
- Public enquiries stored for follow-up.
- Helmet security headers, request body limits, rate limits and a honeypot field.
- Fictional sample listings for demonstration. No payments in this version.

## Requirements
- Node.js 20+
- PostgreSQL 14+ (local or managed)
- npm

## Local setup
1. Extract this project.
2. Create a PostgreSQL database named `jirani_play` and a database user with permission to use it.
3. Copy `.env.example` to `.env`.
4. Set `DATABASE_URL`, a random `SESSION_SECRET` of at least 32 characters, `SEED_ADMIN_EMAIL`, and a strong unique `SEED_ADMIN_PASSWORD`.
5. Install dependencies and create the database schema:

   ```bash
   npm install
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

6. Open http://localhost:3000.

For production, build and start with `npm run build && npm start`. Run database migrations as a deployment step.

## Admin API
Authenticate:
`POST /api/admin/login` with JSON `{ "email": "...", "password": "..." }`

The response includes a `csrfToken`. The browser must retain the session cookie and send the token in `x-csrf-token` on state-changing admin requests.

- `GET /api/admin/me`
- `GET /api/admin/csrf`
- `GET /api/admin/clubs?status=PENDING` (also `APPROVED`, `REJECTED`)
- `PATCH /api/admin/clubs/:id` with `{ "status": "APPROVED" }`, `{ "status": "REJECTED" }`, or `{ "featured": true }`
- `DELETE /api/admin/clubs/:id`
- `POST /api/admin/logout`

The project includes the admin backend endpoints but intentionally does not expose a public admin login page. Use a trusted API client during development or build a restricted admin UI before production launch. Never expose credentials in frontend JavaScript.

## Other endpoints
- `GET /api/health`
- `GET /api/meta`
- `GET /api/clubs?q=&county=&ageGroup=&page=1`
- `GET /api/clubs/:slug`
- `POST /api/clubs`
- `POST /api/clubs/:slug/enquiries`

## Deployment checklist
- Deploy to a platform that supports Node.js and managed PostgreSQL.
- Set environment variables securely in the host dashboard. Do not upload `.env`.
- Set `NODE_ENV=production`, use HTTPS, and set `TRUST_PROXY=1` only if the app is behind a trusted reverse proxy.
- Use a long random session secret and a strong unique admin password. Do not use sample/default credentials.
- Back up the database and configure monitoring and alerts.
- Add a proper admin UI, email verification, audit logging and data retention policies before broad public launch.
- Consider CSRF and origin protections for any future cross-origin setup; keep the frontend and API same-origin where possible.
- Have a privacy notice and clear consent for public contact details. Avoid collecting children's personal data.
- Add anti-spam measures such as CAPTCHA or an email verification flow if abuse appears.
- Sample club names and contacts are fictional examples. Replace with verified club data and obtain permission before publishing.
- No payments are integrated; payment features can be added later with a vetted provider and webhook verification.

## Important
This is a starter project, not a security audit or production certification. Review the code, test migrations and backups, and conduct a security review before launch.
