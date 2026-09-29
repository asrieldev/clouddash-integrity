# Demonstration guide

Record two short screen recordings for the final submission. Use the shared test account only with non-sensitive test material.

## Encoder / Transmitter demo

1. Sign in and open **Encoder / transmitter -> Driver capture**.
2. Select **Driving simulation** and start recording.
3. Show that a local video segment can be played and downloaded from the Local recordings table.
4. Point out the SHA-256 fingerprint, capture time, and Fingerprints sent metric.
5. Select **Simulate network loss**, wait for one segment, then select **Restore uplink** to show the queued fingerprint upload.
6. Import `sample-fingerprints.txt` using **Import .txt hashes**. Show the success message.
7. Explain that the cloud receives timestamps and SHA-256 fingerprints only; the local video is not uploaded.

## Decoder / Insurer demo

1. Open **Decoder / insurer -> Fingerprint audit**.
2. Show the cloud reference stream arriving from Supabase Realtime.
3. Upload `sample-fingerprints.txt` using **Open fingerprint file**.
4. Show the matching result. Then alter one character in a copied file and repeat the check to demonstrate a mismatch.
5. Explain that the Decoder compares each imported value with the persistent cloud reference set.

## Recording notes

Use Windows Snipping Tool screen recording, Xbox Game Bar, or OBS. Keep each recording under three minutes and narrate the actions above. Submit the two video files together with the source code and this repository URL.
