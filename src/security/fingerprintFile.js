const SHA256 = /^[a-fA-F0-9]{64}$/;
const REQUIRED_MANIFEST_FIELDS = ['workspaceId', 'segmentId', 'sessionId', 'deviceId', 'sequence', 'capturedAt', 'bytes', 'sha256', 'previousHash', 'chainHash', 'signature', 'signatureAlgorithm'];

export function createEvidenceManifest(record) {
  return {
    version: Number(record.version ?? 2),
    workspaceId: record.workspaceId ?? record.workspace_id,
    segmentId: record.segmentId ?? record.segment_id,
    sessionId: record.sessionId ?? record.session_id,
    deviceId: record.deviceId ?? record.device_id,
    sequence: Number(record.sequence),
    capturedAt: record.capturedAt ?? record.captured_at,
    bytes: Number(record.bytes),
    sha256: record.sha256,
    previousHash: record.previousHash ?? record.previous_hash ?? null,
    chainHash: record.chainHash ?? record.chain_hash,
    signature: record.signature,
    signatureAlgorithm: record.signatureAlgorithm ?? record.signature_algorithm
  };
}

export function parseEvidenceManifest(text) {
  let parsed;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { return { status: 'INVALID_MANIFEST', manifest: null }; }
  if (Array.isArray(parsed)) {
    const manifests = parsed.map(createEvidenceManifest);
    return manifests.every(manifest => REQUIRED_MANIFEST_FIELDS.every(field => manifest[field] !== undefined && manifest[field] !== ''))
      ? { status: 'VALID', manifests }
      : { status: 'INVALID_MANIFEST', manifests: [] };
  }
  const manifest = createEvidenceManifest(parsed);
  return REQUIRED_MANIFEST_FIELDS.every(field => manifest[field] !== undefined && manifest[field] !== '')
    ? { status: 'VALID', manifest, manifests: [manifest] }
    : { status: 'INVALID_MANIFEST', manifest: null, manifests: [] };
}

export function parseFingerprintFile(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const fingerprints = [];
  const invalidLines = [];
  lines.forEach((line, index) => {
    const value = line.trim();
    if (!value) return;
    if (!SHA256.test(value)) invalidLines.push(index + 1);
    else fingerprints.push(value.toLowerCase());
  });
  return { fingerprints, invalidLines };
}
