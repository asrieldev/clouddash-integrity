# Architecture

## Evidence path

`Dashcam -> API Gateway -> encrypted object storage -> queue -> metadata/hash worker -> AI analysis worker -> PostgreSQL + immutable audit log -> dashboard and alert service`

The browser dashboard communicates with a stateless Express API. Uploads are stored outside the web process in production (S3, Azure Blob Storage, or GCS). A queue decouples ingestion from metadata extraction and GPU/CPU inference. Workers write evidence metadata, the SHA-256 digest, inference results, and audit entries to PostgreSQL.

## Security controls

- TLS at the gateway and server-side encryption for object storage.
- JWT identity with Admin, Analyst, and Viewer roles; API handlers enforce least-privilege roles.
- SHA-256 fingerprints at ingestion and repeatable verification checks.
- Append-only audit event model for evidence and user actions.
- Presigned upload URLs and a managed KMS key are recommended for a production cloud deployment.

## Cost controls

Lifecycle rules move aged evidence to archive storage. Workers scale from queue depth, while analytics reports forecast spend and optimisation opportunities. The API and web application are stateless and suitable for containers or serverless deployment.
