# API reference

All protected endpoints expect `Authorization: Bearer <JWT>`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Returns a demo JWT and role. |
| GET | `/api/dashboard` | Returns high-level operational metrics. |
| GET / POST | `/api/videos`, `/api/videos/upload` | List evidence or ingest a video multipart file. |
| POST | `/api/videos/:id/verify` | Runs an integrity verification action. |
| GET | `/api/incidents` | Returns incident records. |
| GET / PATCH | `/api/alerts`, `/api/alerts/:id/resolve` | List or resolve alerts. |
| GET | `/api/audit-logs` | Returns compliance audit events. |
| GET | `/api/health` | Returns service health. |

`POST /api/videos/upload` accepts a `file` field and is restricted to Admin and Analyst roles. The server computes and stores a SHA-256 fingerprint before creating the evidence record.
