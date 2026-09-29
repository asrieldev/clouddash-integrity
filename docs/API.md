# Backend interface

CloudDash uses the authenticated Supabase client directly. Supabase Auth supplies the user JWT, PostgreSQL RLS authorizes database access, Realtime publishes permitted evidence changes, and private Storage serves only authorized locked incidents. The application has no demo-token endpoint and no endpoint that automatically uploads normal driving video.

## Active application interfaces

| Interface | Purpose |
| --- | --- |
| Supabase Auth | Password signup, sign-in, session restoration, and sign-out. |
| `fingerprints` | Append-only signed SHA-256 evidence metadata. |
| `capture_sessions` | Session identity and start/end metadata. |
| `incidents` and `incident_videos` | Locked incident metadata and its exact fingerprint association. |
| Private `evidence` bucket | Driver-locked incident video only. Objects are retrieved through authorized access. |
| Supabase Realtime | Workspace-scoped fingerprint and incident updates under RLS. |
| `GET /api/health` | Optional Express/container health check. Vercel serves the Vite app without requiring this process. |

## Evidence transfer rules

- Normal video blobs stay in browser IndexedDB. Only their signed fingerprints are inserted into Supabase.
- A user-triggered incident lock may upload the exact locked blob to private Storage after its fingerprint is cloud-acknowledged.
- Decoder uploads are not used for verification. The browser hashes the supplied file locally and compares it with its exact trusted record.
- Supabase service-role keys and device private signing keys are never exposed to the browser or committed to source control.
