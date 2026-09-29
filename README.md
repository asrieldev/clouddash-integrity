# CloudDash Integrity

CloudDash Integrity is a cloud-native video-fingerprint collection system for an insurance company. The Encoder runs on the driver device, retains short video clips locally, and streams timestamped SHA-256 fingerprints to Supabase. The Decoder is the insurer-side interface that retrieves and validates those cloud fingerprints.

## Run locally

```powershell
npm install
npm run start
```

Open `http://127.0.0.1:4173`. The frontend includes rich demo data and stays usable when the API is not running. The API listens on port `3001`.

## Required Encoder / Decoder workflow

### Encoder / transmitter - driver device

1. Open **Driver capture** in the Encoder / transmitter navigation group.
2. Capture with the device camera or the included driving simulation.
3. Each recorded segment remains local for playback and download. Its SHA-256 fingerprint and ISO-8601 timestamp are sent to Supabase; raw video is not uploaded.
4. Use **Import .txt hashes** to read a plain text file containing one 64-character SHA-256 value per line. Each imported value receives a timestamp and is sent or queued.
5. Simulate a connection loss to store fingerprint records in IndexedDB, then restore the uplink to send them.

### Decoder / insurer

1. Open **Fingerprint audit** in the Decoder / insurer navigation group.
2. The page retrieves the persistent Supabase fingerprint stream and updates through Realtime.
3. Use **Open fingerprint file** to compare a future incident `.txt` list with the cloud reference set. Every line must be a 64-character SHA-256 value.
4. A missing value is reported as an integrity mismatch.

`public/sample-fingerprints.txt` is a ready-to-use test file. See [the demonstration guide](docs/DEMO.md) for the required Encoder and Decoder screen recordings.

## Shared test access

The deployed app uses Supabase email/password authentication. A shared administrator is available for demonstrations and testing:

- Email: `admin@clouddash.test`
- Password: `CloudDashDemo2026!`

These are intentionally public test credentials. Do not upload personal, confidential, or production evidence with this account.

## Included workflows

- Local dashcam recording and downloadable browser-only video segments.
- Timestamped SHA-256 fingerprint streaming, `.txt` fingerprint import, queued offline transmission, and Supabase Realtime updates.
- Decoder-side cloud retrieval, hash-file comparison, ordered chain validation, and tamper detection.
- AI incident confidence, alert resolution, analyst notes, audit history, maps, health, analytics, cost monitoring, users, and settings.
- Express REST API with JWT/RBAC middleware, audit events, upload hashing, and operational endpoints.
- Prisma/PostgreSQL schema, Docker Compose deployment scaffold, and seed data.

See [architecture documentation](docs/ARCHITECTURE.md) and [API reference](docs/API.md).

Supabase configuration, RLS, Realtime, and deployment instructions are in [docs/SUPABASE.md](docs/SUPABASE.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Technology choices and attribution

- React and Vite provide the mobile-friendly web application shell.
- Supabase provides hosted PostgreSQL, Authentication, private storage, row-level security, and Realtime.
- Web Crypto (`crypto.subtle`) implements SHA-256; IndexedDB holds fingerprints while the driver is offline.
- Three.js powers the original driving simulation; Lucide supplies interface icons; Recharts supplies analytics visualisations.

All dependencies are declared in `package.json` and used under their respective open-source licenses. No external application source code was copied into this repository.
