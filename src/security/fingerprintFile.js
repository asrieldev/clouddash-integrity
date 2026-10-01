const SHA256 = /^[a-fA-F0-9]{64}$/;
const REQUIRED_MANIFEST_FIELDS = ['workspaceId', 'segmentId', 'sessionId', 'deviceId', 'sequence', 'capturedAt', 'bytes', 'sha256', 'previousHash', 'chainHash', 'signature', 'signatureAlgorithm'];
function validManifest(manifest) {
  return REQUIRED_MANIFEST_FIELDS.every(field => manifest[field] !== undefined && manifest[field] !== '' && (field === 'previousHash' || manifest[field] !== null))
    && [2,3].includes(manifest.version)
    && Number.isInteger(manifest.sequence) && manifest.sequence >= 0
    && Number.isSafeInteger(manifest.bytes) && manifest.bytes >= 0
    && !Number.isNaN(Date.parse(manifest.capturedAt))
    && SHA256.test(manifest.sha256) && SHA256.test(manifest.chainHash)
    && (manifest.previousHash === null || SHA256.test(manifest.previousHash))
    && (manifest.version < 3 || SHA256.test(manifest.perceptualHash));
}

export function createEvidenceManifest(record) {
  return {
    version: Number(record.version ?? 2),
    ...(Number(record.version) >= 3 ? { perceptualHash: record.perceptualHash ?? record.perceptual_hash } : {}),
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
  if (!parsed || typeof parsed !== 'object') return { status: 'INVALID_MANIFEST', manifests: [] };
  if (Array.isArray(parsed)) {
    if (!parsed.length || parsed.some(item => !item || typeof item !== 'object')) return { status: 'INVALID_MANIFEST', manifests: [] };
    const manifests = parsed.map(createEvidenceManifest);
    return manifests.every(validManifest)
      ? { status: 'VALID', manifests }
      : { status: 'INVALID_MANIFEST', manifests: [] };
  }
  const manifest = createEvidenceManifest(parsed);
  return validManifest(manifest)
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
