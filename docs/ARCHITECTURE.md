# Architecture

## Evidence path

`Driver camera or fingerprint .txt -> SHA-256 + timestamp -> IndexedDB offline queue -> Supabase Postgres + Realtime -> insurer Decoder comparison and audit`

The browser Encoder captures video only for local driver playback and download. It does not send raw video to the cloud. It creates SHA-256 fingerprints from recorded data and accepts `.txt` files containing one generated SHA-256 fingerprint per line. Every fingerprint is timestamped before it is persisted in Supabase. IndexedDB queues records while connectivity is unavailable, then flushes them once the uplink returns.

The insurer Decoder receives the cloud fingerprint stream through Supabase Realtime. It imports a future `.txt` fingerprint set and compares each value against the persistent cloud reference set. Missing values are reported as integrity mismatches. The ordered segment-chain audit remains available as a supplementary integrity check for prior evidence records.

## Security controls

- TLS at the gateway and server-side encryption for object storage.
- JWT identity with Admin, Analyst, and Viewer roles; API handlers enforce least-privilege roles.
- SHA-256 fingerprints at ingestion and repeatable verification checks.
- Append-only audit event model for evidence and user actions.
- Presigned upload URLs and a managed KMS key are recommended for a production cloud deployment.

## Cost controls

Lifecycle rules move aged evidence to archive storage. Workers scale from queue depth, while analytics reports forecast spend and optimisation opportunities. The API and web application are stateless and suitable for containers or serverless deployment.
