# Demonstration video narration scripts

Record two separate narrated videos. Keep credentials, API keys, private signing keys, and personal footage out of the recording. Use short non-sensitive clips and keep the browser zoom high enough for evidence states to remain readable.

## Video 1: Encoder / Transmitter

Target duration: four to six minutes.

### 1. Introduce the component

**Show:** Sign-in screen, then Driver capture.

**Say:**

> This is the CloudDash Encoder and Transmitter. It captures dashcam evidence, divides it into fixed-duration segments, stores original normal-driving video locally in browser IndexedDB, and transmits only signed integrity metadata to Supabase. Only an explicitly locked incident is copied to private cloud Storage.

### 2. Explain the architecture

**Show:** The architecture diagram in the README or project report.

**Say:**

> The architecture has four boundaries. Capture begins on the driver device. The browser stores the exact video blob locally, calculates SHA-256, builds session-linked metadata, and signs it with an ECDSA P-256 device key. Supabase stores the public key, capture session, and append-only fingerprint. The insurer independently verifies submitted evidence against that trusted reference. Normal video does not follow the cloud-video path.

### 3. Demonstrate real camera capture

**Show:** Select Camera, grant permission, choose a short segment length, and start recording.

**Say:**

> I am using the browser MediaRecorder API with a real camera. Pressing Start creates a new capture-session UUID. The first segment in this session has sequence zero and a null previous hash. Every later segment links to the preceding chain hash. A later Stop and Start creates a different session rather than continuing an old chain.

### 4. Explain local evidence and cryptography

**Show:** Two local recording rows, session IDs, sequence values, SHA-256 values, playback, and download.

**Say:**

> Each stored blob is exactly the blob that was hashed. SHA-256 covers every encoded video and audio byte in the segment. The metadata also contains the immutable segment ID, session ID, device ID, sequence, timestamp, byte count, previous hash, chain hash, signature, and signature algorithm. The private signing key remains on this browser device. Only its public key is stored in Supabase.

> The SENT state means Supabase acknowledged the fingerprint. It does not mean the video has already been verified. VERIFIED is produced later by the Decoder after all cryptographic checks pass.

### 5. Demonstrate session isolation

**Show:** Stop, start again, and compare the new session with the earlier one.

**Say:**

> This new recording has a new session ID, sequence zero, and no previous hash. Old cloud records or failed queue items cannot become the starting point of this session. Immutable segment UUIDs prevent a new sequence-zero segment from overwriting an older recording.

### 6. Demonstrate offline resilience

**Show:** Simulate network loss, record a segment, open Ingestion queue, refresh, restore connectivity, and retry if needed.

**Say:**

> While offline, the video and its original signed fingerprint remain in IndexedDB. Refreshing does not discard them. Reconnect and manual retry resend the same session ID, sequence, hashes, and signature. The queue does not recalculate or attach the fingerprint to another recording. Idempotent insertion prevents duplicate replay from creating a second trusted record.

### 7. Demonstrate retention and incident locking

**Show:** Retention setting, Lock incident clip, locked rows, and private incident availability.

**Say:**

> Rolling retention removes expired normal video from this device but never deletes its cloud fingerprint. Lock Incident protects the configured pre-roll, event, and post-roll window from normal retention. Only those locked blobs are uploaded to the private evidence bucket. If an object already exists at the deterministic path, CloudDash downloads and hashes it; different bytes cause STORAGE_OBJECT_MISMATCH instead of an overwrite.

### 8. Close the Encoder video

**Say:**

> The Encoder therefore meets the capture, composition, hashing, dynamic transmission, network interruption, retention, timestamp, and secure cloud-reference requirements while preserving the local-first privacy boundary.

## Video 2: Decoder / Insurer verification

Target duration: five to seven minutes.

### 1. Introduce trusted verification

**Show:** Verify evidence and the Realtime cloud reference stream.

**Say:**

> This is the insurer-side Decoder. It does not trust a filename, a user-provided hash, a SENT label, or a video simply because it exists in cloud Storage. It calculates the supplied bytes locally and resolves the exact trusted fingerprint stored in Supabase.

### 2. Verify an original recording

**Show:** Open the signed JSON manifest, then open the matching original video.

**Say:**

> The manifest identifies one immutable segment and session. CloudDash hashes the selected video bytes using SHA-256 and compares the calculated digest with the trusted database value. It then verifies the ECDSA signature using the registered device public key, checks device and session identity, recomputes the chain hash, verifies the previous-hash link, and checks sequence continuity. VERIFIED appears only when all required checks pass.

### 3. Explain blur, crop, overlay, and partial edits

**Show:** Submit a blurred, cropped, overlaid, trimmed, or re-encoded copy.

**Say:**

> A blur changes pixel values and re-encoding changes the file's encoded bytes. Cropping, overlays, frame deletion, frame insertion, trimming, compression, resolution changes, and audio edits also change the byte stream. The calculated SHA-256 therefore differs from the trusted fingerprint, and CloudDash returns FILE_HASH_MISMATCH or FINGERPRINT_NOT_FOUND. It never authenticates the edited copy as the original.

> SHA-256 proves exact byte equality. It does not identify whether the edit was specifically a blur, crop, overlay, or another operation. The correct forensic statement is that the supplied file differs from the trusted reference or is the wrong file.

### 4. Explain replacement video and wrong manifest attacks

**Show:** Pair Video B with Video A's manifest.

**Say:**

> Replacing the video or pairing it with another segment's manifest fails because the calculated file hash does not match the exact segment record. Session ID, segment ID, device ID, sequence, timestamp, byte size, and chain fields are signed, so evidence from another recording cannot be relabeled as this segment.

### 5. Explain changed hash and manifest attacks

**Show:** Change the SHA-256 field or another signed field in a copied JSON manifest.

**Say:**

> The Decoder does not trust the hash supplied in this file. It resolves the cloud record and compares all signed fields. Changing the SHA-256 value, timestamp, device, session, sequence, previous hash, chain hash, or byte count causes INVALID_MANIFEST, INVALID_SIGNATURE, SESSION_MISMATCH, DEVICE_MISMATCH, or BROKEN_CHAIN. An attacker can calculate a new hash for an edited video, but cannot create the original device's valid signature or replace the append-only trusted record.

### 6. Demonstrate legacy TXT behavior

**Show:** Open `public/sample-fingerprints.txt`, then change one hash character or add a malformed line.

**Say:**

> Legacy TXT accepts one 64-character hexadecimal SHA-256 value per line. A changed valid-looking value is not found in the trusted stream, and malformed input is rejected. A raw TXT hash is review-only because it does not carry a signed session, segment, device, sequence, or chain identity.

### 7. Explain missing or reordered evidence

**Show:** Integrity log or a prepared test result for a missing/reordered sequence.

**Say:**

> Within each modern capture session, sequence zero must have no previous hash, and every later segment must reference the prior chain hash. Removing a middle segment produces MISSING_SEQUENCE or BROKEN_CHAIN. Reordering or duplicating sequences also fails chain verification. Separate sessions are never mixed into one chain.

### 8. Verify private incident evidence

**Show:** Protected incident videos, authorized playback/download, and verification.

**Say:**

> Cloud incident verification downloads the private object through authenticated access, hashes the retrieved blob locally, resolves its exact fingerprint and segment association, and repeats signature and session-chain verification. A modified or incorrectly associated Storage object returns STORAGE_OBJECT_MISMATCH or FILE_HASH_MISMATCH, never VERIFIED.

### 9. Close the Decoder video

**Say:**

> CloudDash combines exact-byte SHA-256, device signatures, session-scoped hash chains, immutable identifiers, append-only cloud references, RLS, and private incident storage. These controls detect modified, replaced, relabeled, missing, reordered, and inconsistently stored evidence while keeping normal driving video on the driver's device.

## Recording checklist

- Record Video 1 and Video 2 as separate files.
- Show the deployed URL and application name, but hide credentials and browser autofill suggestions.
- Use real camera capture once in Video 1.
- Use a fresh session so the sequence starts at zero.
- Prepare the edited video and changed manifest before recording Video 2.
- Keep the original and edited filenames visibly distinct.
- Show the exact failure status, not only a red badge.
- End each recording with the relevant requirement summary.
