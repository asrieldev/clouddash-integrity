# CloudDash Integrity

CloudDash is a hybrid dashcam integrity prototype for insurance evidence. Supabase Auth is authoritative; PostgreSQL stores trusted fingerprints and private Storage holds only driver-locked incident video.

## Verification history and video evaluation

The Decoder records every exact-video, manifest, protected-incident, evaluation-batch, and network-recovery check in **Integrity & history**, also visible on the monitor and Decoder. Existing records are interpreted with the same clear result labels as new records. Each row explains what failed—such as changed bytes, a missing cloud reference, invalid signature, broken chain, false match, missed match, or decode error—and keeps hashes, session IDs, segment IDs, affected files, and match totals under expandable technical details. Attempts are written to a per-user browser outbox before cloud sync, so failed checks are not lost during an outage.

The displayed **reliability** remains the exact-video pass rate: `VERIFIED / completed video checks`. Missing references and mismatches lower this rate; processing errors are counted separately. Manifest, evaluation, and network records remain visible but do not inflate the exact-video score. These are client-reported audit attempts, not server-attested verdicts.

Open **Video evaluation** and select **Load demo dataset** for the shortest path through all 23 labelled scenarios, or use the three-step original/test/run workflow for your own videos. The first results view emphasizes tested videos, false matches, missed matches, decode errors, and whether problems were found; metric tables and threshold calibration stay collapsed until needed. The bundled videos are synthetic FFmpeg patterns, clearly labelled; they are not real dashcam footage. The lab is also available without an account at `/evaluation-local` for local-only benchmarking; cloud references and cloud history remain authenticated.

For partially changed footage, CloudDash displays a timestamped section-review timeline. Green ranges appear consistent with the trusted recording, red ranges need human review because their sampled frames did not align, and amber ranges lack enough visual detail for a reliable similarity decision. Selecting a range jumps the uploaded-video preview to that time. The app also reports cautious modification indicators: changed/replaced section, possible deletion, possible reordering, possible duplication, or possible speed change. It cannot reliably distinguish blur, crop, overlay, or another visual transformation from perceptual hashes alone. These are review indicators, not proof of the editing method; exact authenticity still depends on SHA-256, signature, and chain verification.

New recordings use signed version-3 fingerprints that bind frame profiles to the exact SHA-256 evidence chain. Older recordings remain verifiable by SHA-256, but cannot acquire perceptual fingerprints without their original video. A `CONTENT_MATCH` can identify a transformed clip while its exact-byte integrity remains unverified. Never equate visual similarity with `VERIFIED`.

- [Measured synthetic results and failure analysis](docs/evaluation/RESULTS.md)
- [Evaluation procedure, metrics and limitations](docs/EVALUATION.md)
- [All quantitative measurements (CSV)](docs/evaluation/results.csv)
- [Fuzzy-hash results and thresholds](docs/evaluation/fuzzy-results.json)

Reproduce the full benchmark (FFmpeg is installed as a pinned development dependency):

```powershell
npm ci
npm test
npm run evaluate -- --out tmp/my-evaluation --sweep
# Use two different real trips for a more useful dataset (12-second excerpts):
npm run evaluate -- --source C:/videos/trip-a.mp4 --other C:/videos/trip-b.mp4 --out tmp/real-trips --sweep
```

The command writes the original, all transformed videos, a labelled `manifest.json`, `results.json`, and `results.csv`. Use a new output directory for each run. Supply `--ffmpeg <path>` if using your own FFmpeg. Browser HEVC support depends on the browser; the CLI tests HEVC through FFmpeg. Apply every migration, including `20260930081536_verification_and_matching.sql`, before deploying the new frontend.

## Complete first-time configuration

### 1. Install the development tools

Install Node.js 22 or newer, Git, a current Chromium-based browser, and the Supabase CLI. Docker Desktop is required only when running Supabase locally.

```powershell
git clone https://github.com/asrieldev/clouddash-integrity.git
cd clouddash-integrity
npm ci
```

### 2. Create the Supabase backend

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) and select **New project**.
2. Choose an organization, project name, database password, and region. Store the database password securely; do not add it to this repository.
3. Wait for project provisioning to finish.
4. Open **Authentication -> Providers -> Email** and enable email/password authentication.
5. Open **Authentication -> URL Configuration**. During local development, set the site URL or an allowed redirect URL to `http://127.0.0.1:5173`. Add the final Vercel origin after deployment.
6. If email confirmation is enabled, users must confirm their email before signing in. Keep confirmation enabled for production; a coursework test project may use Supabase's test-email workflow.

Link the CLI and apply every committed migration in timestamp order:

```powershell
supabase login
supabase link --project-ref <your-project-reference>
supabase db push
```

The migrations create profiles, workspaces, memberships, devices, capture sessions, append-only fingerprints, incidents, private incident-video metadata, RLS policies, Realtime publication, and the private `evidence` Storage bucket. Do not make that bucket public.

For a fully local backend instead:

```powershell
supabase start
supabase db reset
```

### 3. Configure the frontend

In Supabase, use the project's **Connect** dialog to copy the project URL and publishable key, or open **Settings -> API Keys** to select a specific publishable/legacy anon key. These are public browser configuration values protected by RLS; never use a secret/service-role key in the frontend.

```powershell
Copy-Item .env.example .env
```

Set the two values in `.env`:

```dotenv
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-publishable-or-anon-key"
```

### 4. Start and sign in

```powershell
npm run dev
```

1. Open the URL printed by Vite, normally `http://127.0.0.1:5173`.
2. Select **Need an account? Create one**.
3. Enter a display name, email, and a password of at least six characters.
4. Confirm the email if the Supabase project requires confirmation.
5. Return to CloudDash and sign in with that email and password.
6. On first authenticated load, CloudDash calls `bootstrap_workspace`. It creates the **Forensics Lab** workspace and makes this first user its admin. Existing members reuse their current workspace.
7. Opening **Driver capture** provisions a persistent device UUID, creates an ECDSA P-256 key pair in browser IndexedDB, and stores only the public key in Supabase. No private key or password is committed or uploaded.

### 5. Optional separate insurer account

The same authorized account can demonstrate both application components. To test a separate insurer/analyst identity:

1. Create and confirm a second Supabase Auth user through the CloudDash signup screen.
2. In Supabase Dashboard, obtain the first workspace ID and the second user's Auth UUID.
3. As the project owner, add that user to the existing workspace with an analyst role in **SQL Editor**:

```sql
insert into public.workspace_members (workspace_id, user_id, role)
values ('<existing-workspace-uuid>', '<analyst-auth-user-uuid>', 'analyst')
on conflict (workspace_id, user_id)
do update set role = excluded.role;
```

4. Sign in as the analyst and open **Live monitor** or **Verify evidence**. RLS limits the account to its authorized workspace.

Do not publish test passwords in the README. Share coursework test credentials privately and rotate or remove them after assessment.

## Encoder workflow

1. Sign in and open **Driver capture**.
2. Choose **Camera** and grant browser camera permission. Use **Driving simulation** only when a camera is unavailable.
3. Choose segment length, local retention, and incident pre/post-roll values.
4. Select **Start dashcam**. Each start creates a new capture-session UUID at sequence `0` with a null previous hash.
5. Wait for local segments to appear. Confirm playback, byte size, SHA-256, transmission state, and session identity.
6. Use **Simulate network loss**, record another segment, refresh, restore the uplink, and confirm the durable outbox retries the original fingerprint.
7. Select **Lock incident clip** to preserve the configured segment window and upload only those locked segments to private Storage.
8. Download an original video and its signed JSON evidence manifest for Decoder verification.

## Decoder workflow

1. Sign in as an authorized workspace member and open **Verify evidence**.
2. Confirm the cloud reference stream is connected through Supabase Realtime.
3. Open a signed JSON evidence manifest to identify one exact session segment.
4. Open the matching downloaded video. `VERIFIED` requires an exact SHA-256 match, trusted cloud record, valid device signature, matching device/session/sequence, and a valid session chain.
5. Modify or re-encode a copy and open it to demonstrate `FILE_HASH_MISMATCH` or `FINGERPRINT_NOT_FOUND`.
6. Open `public/sample-fingerprints.txt` to demonstrate legacy one-hash-per-line compatibility. Raw hashes remain review-only because they do not contain signed session identity.
7. Under **Protected incident videos**, retrieve an authorized private incident, then play, download, and verify it.

## Deploy to Vercel

1. Push the repository to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. Set the build command to `npm run build` and output directory to `dist`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Vercel project environment variables.
4. Deploy, then add the deployed HTTPS origin to Supabase **Authentication -> URL Configuration** as the site URL and redirect URL.
5. Sign up or sign in on the deployed application and complete the Encoder and Decoder acceptance workflow above.

## Troubleshooting

- **Supabase configuration missing:** verify both `VITE_` variables, then restart Vite or redeploy Vercel.
- **Schema-cache or missing-column error:** run `supabase db push` against the same project configured in `.env` and refresh the application.
- **Fingerprint rejected by RLS:** confirm the signed-in user belongs to the workspace, owns the driver device or has analyst/admin access, and all migrations are applied.
- **Camera unavailable:** use HTTPS or localhost, allow browser camera permission, close other applications using the camera, and retry.
- **Outbox remains failed:** restore connectivity, select **Retry outbox**, and read the surfaced safe error. Do not delete queued evidence merely to hide the failure.
- **Downloaded video does not verify:** pair the exact original blob with its own manifest. Re-encoding, renaming through software that rewrites bytes, or selecting a manifest from another segment must fail verification.
- **Incident cannot upload:** confirm the fingerprint is cloud-acknowledged, the bucket is private, and Storage/incident RLS migrations are present.

## Hybrid architecture

![CloudDash hybrid evidence architecture](docs/assets/clouddash-hybrid-architecture.png)

The diagram separates four trust boundaries: driver capture, device-side processing and local storage, Supabase cloud services, and insurer-side verification. Green paths remain local, blue paths transmit signed metadata, orange paths carry only explicitly locked incident video, and purple paths represent authenticated retrieval and verification.

### Normal driving

Each Start Dashcam action creates a new capture session. The Encoder records fixed-length video segments and persists their original blobs in IndexedDB under immutable segment UUIDs. It calculates SHA-256 over the exact bytes, links fingerprints only within that capture session, signs the canonical metadata with a device-local ECDSA P-256 private key, and sends only the fingerprint to Supabase. Normal video is never uploaded automatically.

### Incident evidence

**Lock incident clip** protects a finite before/current/after window from local retention. Its fingerprint follows the same append-only path. The locked video is additionally copied to the private `evidence` bucket and linked to its fingerprint through `incident_videos`.

### Decoder

The Decoder accepts `.webm`, `.mp4`, signed `.json` evidence manifests, and legacy `.txt` hash files. Video hashing happens locally; the supplied file is not uploaded for verification. A `VERIFIED` result requires an exact SHA-256 match, a valid device signature, a valid session sequence/hash chain, and the trusted Supabase record. Authorized users can also retrieve, play, download, and verify cloud incident video. Legacy evidence is marked for review rather than presented as session-verified.

## Security meaning

- SHA-256 detects byte changes, including blur, crop, overlays, frame edits, re-encoding, compression, resolution changes, audio changes, and replacement. It does not identify which visual edit occurred.
- The device signature authenticates the evidence metadata. The private key remains in device-side IndexedDB; only the public key is stored in Supabase.
- The hash chain detects changed metadata, missing or reordered sequences, duplicate sequences, and broken previous-hash links.
- The append-only cloud fingerprint is the trusted reference. Application roles cannot update or delete it.
- A hash cannot reconstruct deleted video. Expired normal video disappears locally while its cloud fingerprint remains. Locked incident video survives local retention and may be preserved in private cloud storage.

## Offline and retention

Fingerprint transmission uses a persistent IndexedDB outbox with `QUEUED`, `SENDING`, `SENT`, and `FAILED` states. Retries run on startup, reconnect, and manual request without changing the original session, segment identity, sequence, or chain fields. Every new capture session starts at sequence `0` with a null previous hash. Normal local video is deleted after the configured retention period; locked video is exempt.

## Supabase

Apply migrations in `supabase/migrations` to the linked project:

```powershell
npx supabase db push
```

The `evidence` bucket must remain private. RLS authorizes drivers for their own device and analysts/admins for workspace evidence.

## Validation

```powershell
npm test
npm run build
```

The automated suite covers SHA-256 and ECDSA tamper detection, session-scoped chain failures, manifest validation, local retention, offline queue recovery, persistent IndexedDB delivery, perceptual alignment, fuzzy hashing in a strict browser bundle, evaluation thresholds, downloaded-video metric checks, and human-readable history explanations. CI runs `npm ci`, the complete Node test suite, and a production Vite build for every push and pull request.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SUPABASE.md](docs/SUPABASE.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), and [docs/VIDEO_SCRIPTS.md](docs/VIDEO_SCRIPTS.md).

## Design choice: segment fingerprints

CloudDash treats each fixed-duration MediaRecorder blob as the forensic evidence unit. SHA-256 covers the exact container bytes, including every encoded frame and audio byte in that segment, so any blur, crop, frame insertion or deletion, overlay, re-encoding, truncation, replacement, or other byte change invalidates the trusted digest. This design sends one bounded fingerprint per playable evidence segment instead of extracting and transmitting a digest for every decoded frame. It protects exact-file integrity but does not identify which visual edit occurred.

## Open-source attribution and references

CloudDash uses the following open-source software and standard browser APIs. Project dependency versions are recorded in `package-lock.json`.

| Component | Use | License or specification |
| --- | --- | --- |
| React and React DOM | User interface | MIT; [react.dev](https://react.dev/) |
| React Router | Client-side routing | MIT; [reactrouter.com](https://reactrouter.com/) |
| TanStack Query | Asynchronous client state | MIT; [tanstack.com/query](https://tanstack.com/query/latest) |
| Supabase JavaScript | Auth, PostgreSQL, Realtime, and private Storage | MIT; [supabase.com/docs](https://supabase.com/docs) |
| Vite and React plugin | Development and production build | MIT; [vite.dev](https://vite.dev/) |
| Lucide React | Interface icons | ISC; [lucide.dev](https://lucide.dev/) |
| Recharts | Dashboard charts | MIT; [recharts.org](https://recharts.org/) |
| Three.js | Driving simulation rendering | MIT; [threejs.org](https://threejs.org/) |
| Express, CORS, and Concurrently | Optional local/container tooling | MIT; official package repositories |
| Web Crypto API | SHA-256 and ECDSA P-256 | [W3C Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/) |
| IndexedDB, MediaRecorder, and getUserMedia | Local persistence and camera recording | [MDN Web APIs](https://developer.mozilla.org/docs/Web/API) |
| Node.js test runner | Automated evidence tests | MIT; [nodejs.org/api/test.html](https://nodejs.org/api/test.html) |

No third-party source code is copied into the application beyond installed dependencies. Generated evidence, credentials, service-role keys, and device private signing keys must not be committed.
