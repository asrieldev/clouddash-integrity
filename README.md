# CloudDash Integrity

CloudDash is a hybrid dashcam integrity prototype for insurance evidence. Supabase Auth is authoritative; PostgreSQL stores trusted fingerprints and private Storage holds only driver-locked incident video.

## Run locally

```powershell
npm install
npm run dev
```

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`. Never commit service-role keys or user credentials.

## Hybrid architecture

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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SUPABASE.md](docs/SUPABASE.md), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
