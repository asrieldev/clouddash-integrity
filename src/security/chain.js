const encoder = new TextEncoder();

export async function sha256(value) {
  const input = value instanceof Uint8Array ? value : encoder.encode(typeof value === 'string' ? value : JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createEvidenceSegment({ sequence, capturedAt, bytes, previousHash = null, metadata = {} }) {
  const canonical = JSON.stringify({ sequence, capturedAt, bytes, metadata });
  const contentHash = await sha256(canonical);
  const chainHash = await sha256(`${previousHash || 'GENESIS'}:${contentHash}:${sequence}`);
  return { sequence, capturedAt, bytes, metadata, sha256: contentHash, previousHash, chainHash };
}

export async function verifyEvidenceChain(segments) {
  let previousHash = null;
  for (const segment of [...segments].sort((a, b) => a.sequence - b.sequence)) {
    const expected = await sha256(`${previousHash || 'GENESIS'}:${segment.sha256}:${segment.sequence}`);
    if (expected !== segment.chainHash || segment.previousHash !== previousHash) return { valid: false, failedSequence: segment.sequence, expected };
    previousHash = segment.chainHash;
  }
  return { valid: true, lastHash: previousHash };
}
