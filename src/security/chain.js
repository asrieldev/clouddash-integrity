const encoder = new TextEncoder();

export const EVIDENCE_VERSION = 1;

export async function sha256(value) {
  const input = value instanceof Uint8Array
    ? value
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : encoder.encode(typeof value === 'string' ? value : JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function requiredText(value, name) {
  if (typeof value !== 'string' || !value) throw new Error(`${name} is required`);
  return value;
}

export function canonicalChainPayload(record) {
  return JSON.stringify({
    version: Number(record.version ?? EVIDENCE_VERSION),
    workspaceId: requiredText(record.workspaceId ?? record.workspace_id, 'workspaceId'),
    deviceId: requiredText(record.deviceId ?? record.device_id, 'deviceId'),
    sequence: Number(record.sequence),
    capturedAt: requiredText(record.capturedAt ?? record.captured_at, 'capturedAt'),
    bytes: Number(record.bytes),
    sha256: requiredText(record.sha256, 'sha256'),
    previousHash: record.previousHash ?? record.previous_hash ?? null
  });
}

export function canonicalFingerprintPayload(record) {
  return JSON.stringify({
    ...JSON.parse(canonicalChainPayload(record)),
    chainHash: requiredText(record.chainHash ?? record.chain_hash, 'chainHash')
  });
}

export async function createEvidenceSegment({ version = EVIDENCE_VERSION, workspaceId, deviceId, sequence, capturedAt, bytes, contentHash, previousHash = null, metadata = {} }) {
  const segmentHash = contentHash || await sha256(JSON.stringify(metadata));
  const base = { version, workspaceId, deviceId, sequence, capturedAt, bytes, sha256: segmentHash, previousHash, metadata };
  const chainHash = await sha256(canonicalChainPayload(base));
  return { ...base, chainHash };
}

export async function verifyEvidenceChain(segments) {
  if (!segments.length) return { valid: true, lastHash: null };
  const seen = new Set();
  let previous = null;

  for (const segment of segments) {
    const sequence = Number(segment.sequence);
    if (seen.has(sequence)) return { valid: false, status: 'DUPLICATE_SEQUENCE', failedSequence: sequence };
    seen.add(sequence);

    if (previous) {
      if (sequence < previous.sequence) return { valid: false, status: 'REORDERED_SEQUENCE', failedSequence: sequence };
      if (sequence !== previous.sequence + 1) return { valid: false, status: 'MISSING_SEQUENCE', failedSequence: previous.sequence + 1 };
    }

    const previousHash = segment.previousHash ?? segment.previous_hash ?? null;
    const expectedPrevious = previous ? (previous.chainHash ?? previous.chain_hash) : null;
    if ((previous && previousHash !== expectedPrevious) || (!previous && sequence === 0 && previousHash !== null)) {
      return { valid: false, status: 'BROKEN_CHAIN', failedSequence: sequence, reason: 'previous_hash mismatch' };
    }

    let expected;
    try {
      expected = await sha256(canonicalChainPayload(segment));
    } catch (error) {
      return { valid: false, status: 'BROKEN_CHAIN', failedSequence: sequence, reason: error.message };
    }
    if (expected !== (segment.chainHash ?? segment.chain_hash)) {
      return { valid: false, status: 'BROKEN_CHAIN', failedSequence: sequence, expected, reason: 'chain_hash mismatch' };
    }
    previous = segment;
  }

  return { valid: true, lastHash: previous.chainHash ?? previous.chain_hash };
}
