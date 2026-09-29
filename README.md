# CloudDash Integrity

CloudDash Integrity is a cloud-native dashcam evidence workspace for secure ingestion, SHA-256 integrity verification, AI incident triage, and analyst operations.

## Run locally

```powershell
npm install
npm run start
```

Open `http://127.0.0.1:4173`. The frontend includes rich demo data and stays usable when the API is not running. The API listens on port `3001`.

## Shared test access

The deployed app uses Supabase email/password authentication. A shared administrator is available for demonstrations and testing:

- Email: `admin@clouddash.test`
- Password: `CloudDashDemo2026!`

These are intentionally public test credentials. Do not upload personal, confidential, or production evidence with this account.

## Included workflows

- Encrypted evidence upload simulation with progress and queued processing.
- Metadata, SHA-256 fingerprint, integrity ledger, and tamper-test interface.
- AI incident confidence, alert resolution, analyst notes, audit history, maps, health, analytics, cost monitoring, users, and settings.
- Express REST API with JWT/RBAC middleware, audit events, upload hashing, and operational endpoints.
- Prisma/PostgreSQL schema, Docker Compose deployment scaffold, and seed data.

See [architecture documentation](docs/ARCHITECTURE.md) and [API reference](docs/API.md).

Supabase configuration, RLS, Realtime, and deployment instructions are in [docs/SUPABASE.md](docs/SUPABASE.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
