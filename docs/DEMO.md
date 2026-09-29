# Assessed demonstration guide

Record two short screen recordings for the final submission. Use the shared test account only with non-sensitive test material.

## Encoder / Transmitter demo

1. Sign in and open **Encoder / transmitter -> Driver capture**.
2. Select **Camera**, grant browser permission, and record at least two segments on a real computer or smartphone camera.
3. Point out the capture-session ID, session-relative sequence, timestamp, exact-byte SHA-256, local retention state, and `SENT` fingerprint state.
4. Play and download one local segment. Explain that normal video remains in IndexedDB and only the signed fingerprint reaches Supabase.
5. Start a second recording and show that it receives a new session ID, sequence `0`, and a null previous hash.
6. Select **Simulate network loss**, capture a segment, refresh, and show that both the local video and queued fingerprint remain available. Restore the uplink and show the same fingerprint becoming `SENT` once.
7. Lock an incident window and show that only those locked segments are retained and copied to the private `evidence` bucket.
8. Briefly show the configured retention policy and that normal expired video is removed without deleting its cloud fingerprint.

## Decoder / Insurer demo

1. Open **Decoder / insurer -> Verify evidence** and show the Supabase Realtime reference stream.
2. Download an original Encoder segment and its version-2 JSON evidence manifest.
3. Open the manifest, then select the original video and show `VERIFIED`. Point out the file hash, device signature, session identity, sequence, and chain result.
4. Re-encode, blur, crop, or change one byte of a copy and show `FILE_HASH_MISMATCH` or `FINGERPRINT_NOT_FOUND`, never `VERIFIED`.
5. Change one field or the signature in a copied JSON manifest and show `INVALID_MANIFEST` or `INVALID_SIGNATURE`.
6. Open `public/sample-fingerprints.txt` to demonstrate backward-compatible one-SHA-256-per-line parsing. Change a character or add a malformed line and show the review-only failure result. Explain that a raw hash does not prove session identity.
7. Retrieve a private locked incident video, then play, download, and verify it against its exact fingerprint.

## Recording notes

Use Windows Snipping Tool screen recording, Xbox Game Bar, or OBS. Keep each recording concise, narrate the security meaning of every state, and avoid showing credentials or tokens. Submit the two video files together with the report, source code, deployed URL, and repository URL.

## Submission checklist

- Encoder demonstration video
- Decoder demonstration video
- Project report in DOCX and PDF
- GitHub repository URL and deployed Vercel URL
- Test account instructions supplied separately from source control
- `npm test` and `npm run build` results
