# Demonstration guide

Record two short screen recordings for the final submission. Use the shared test account only with non-sensitive test material.

## Encoder / Transmitter demo

1. Sign in and open **Encoder / transmitter -> Driver capture**.
2. Select **Driving simulation** and start recording.
3. Show that a local video segment can be played and downloaded from the Local recordings table.
4. Point out the SHA-256 fingerprint, capture time, and Fingerprints sent metric.
5. Select **Simulate network loss**, wait for one segment, then select **Restore uplink** to show the queued fingerprint upload.
6. Refresh the page and show that IndexedDB restores the local recording and outbox state.
7. Lock an incident window and show that only locked video becomes available to the insurer.

## Decoder / Insurer demo

1. Open **Decoder / insurer -> Fingerprint audit**.
2. Show the cloud reference stream arriving from Supabase Realtime.
3. Download an original Encoder video and verify it to show `VERIFIED`.
4. Re-encode or blur a copy and verify it to show `MISMATCH`.
5. Download a fingerprint `.txt`, alter one character, and show `NOT_FOUND`.
6. Retrieve a private locked incident video, then play, download, and verify it.

## Recording notes

Use Windows Snipping Tool screen recording, Xbox Game Bar, or OBS. Keep each recording under three minutes and narrate the actions above. Submit the two video files together with the source code and this repository URL.
