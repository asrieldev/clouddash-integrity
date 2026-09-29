import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalFingerprintPayload, createEvidenceSegment, sha256, verifyEvidenceChain } from '../src/security/chain.js';
import { exportPublicKey, generateDeviceKeyPair, signFingerprint, verifyFingerprintSignature } from '../src/security/deviceKeys.js';
import { dedupeQueueItems, queueItemId } from '../src/storage/offlineQueue.js';
import { expiredNormalVideos } from '../src/storage/localEvidenceStore.js';
import { compareVideoHash } from '../src/security/verification.js';
import { createEvidenceManifest, parseEvidenceManifest } from '../src/security/fingerprintFile.js';

const identity = { workspaceId: 'workspace-1', deviceId: 'device-1', sessionId: 'session-1' };

async function chain(length = 3) {
  const records = [];
  let previousHash = null;
  for (let sequence = 0; sequence < length; sequence += 1) {
    const record = await createEvidenceSegment({ ...identity, segmentId: `segment-${sequence}`, sequence, capturedAt: `2026-09-28T14:00:0${sequence}Z`, bytes: 100 + sequence, contentHash: await sha256(`video-${sequence}`), previousHash });
    records.push(record);
    previousHash = record.chainHash;
  }
  return records;
}

test('canonical serialization is stable and binds evidence metadata', async () => {
  const [record] = await chain(1);
  assert.equal(canonicalFingerprintPayload(record), canonicalFingerprintPayload({ metadata: 'ignored', ...record }));
  assert.notEqual(canonicalFingerprintPayload(record), canonicalFingerprintPayload({ ...record, bytes: record.bytes + 1 }));
});

test('detects changed hash and tampered metadata', async () => {
  const records = await chain();
  assert.equal((await verifyEvidenceChain(records.map((record, index) => index === 1 ? { ...record, sha256: '0'.repeat(64) } : record))).status, 'BROKEN_CHAIN');
  assert.equal((await verifyEvidenceChain(records.map((record, index) => index === 1 ? { ...record, capturedAt: '2026-01-01T00:00:00Z' } : record))).status, 'BROKEN_CHAIN');
});

test('detects broken, missing, and reordered sequence links', async () => {
  const records = await chain();
  assert.equal((await verifyEvidenceChain([records[0], { ...records[1], previousHash: 'f'.repeat(64) }])).status, 'BROKEN_CHAIN');
  assert.equal((await verifyEvidenceChain([records[0], records[2]])).status, 'MISSING_SEQUENCE');
  assert.equal((await verifyEvidenceChain([records[1], records[0]])).status, 'REORDERED_SEQUENCE');
});

test('ECDSA signs canonical evidence and rejects signature or metadata tampering', async () => {
  const [record] = await chain(1);
  const pair = await generateDeviceKeyPair();
  const publicJwk = await exportPublicKey(pair.publicKey);
  const signature = await signFingerprint(pair.privateKey, record);
  assert.equal(await verifyFingerprintSignature(publicJwk, record, signature), true);
  assert.equal(await verifyFingerprintSignature(publicJwk, { ...record, capturedAt: '2026-01-01T00:00:00Z' }, signature), false);
  assert.equal(await verifyFingerprintSignature(publicJwk, record, `${signature.slice(0, -2)}AA`), false);
});

test('queue identity is immutable per segment and isolated across sessions', () => {
  const fingerprint = { deviceId: 'device-1', sessionId: 'session-a', segmentId: 'segment-a', sequence: 0 };
  assert.equal(dedupeQueueItems([{ fingerprint, state: 'QUEUED' }, { fingerprint, state: 'FAILED' }]).length, 1);
  assert.equal(queueItemId({ fingerprint }), 'segment-a');
  assert.notEqual(queueItemId({ fingerprint }), queueItemId({ fingerprint: { ...fingerprint, sessionId: 'session-b', segmentId: 'segment-b' } }));
});

test('a new capture session starts at sequence zero with no previous hash', async () => {
  const old = await createEvidenceSegment({ ...identity, segmentId: 'old', sequence: 0, capturedAt: '2026-09-28T14:00:00Z', bytes: 10, contentHash: await sha256('old') });
  const fresh = await createEvidenceSegment({ ...identity, sessionId: 'session-2', segmentId: 'fresh', sequence: 0, capturedAt: '2026-09-28T15:00:00Z', bytes: 10, contentHash: await sha256('fresh'), previousHash: null });
  assert.notEqual(old.sessionId, fresh.sessionId);
  assert.equal(fresh.sequence, 0);
  assert.equal(fresh.previousHash, null);
  assert.equal((await verifyEvidenceChain([fresh])).valid, true);
});

test('video hashes compare exact bytes only', async () => {
  const original = await sha256(new TextEncoder().encode('original video bytes'));
  const edited = await sha256(new TextEncoder().encode('original video bytes edited'));
  assert.equal(compareVideoHash(original, original).status, 'VERIFIED');
  assert.equal(compareVideoHash(edited, original).status, 'FILE_HASH_MISMATCH');
});

test('structured manifest preserves session identity and rejects missing fields', async () => {
  const [record] = await chain(1);
  const manifest = createEvidenceManifest({ ...record, signature: 'signed-value', signatureAlgorithm: 'ECDSA_P256_SHA256' });
  assert.equal(manifest.workspaceId, record.workspaceId);
  assert.equal(parseEvidenceManifest(JSON.stringify(manifest)).manifest.segmentId, record.segmentId);
  delete manifest.sessionId;
  assert.equal(parseEvidenceManifest(JSON.stringify(manifest)).status, 'INVALID_MANIFEST');
});

test('retention deletes expired normal video but preserves locked evidence', () => {
  const records = [
    { id: 'normal', capturedAt: '2026-09-28T10:00:00Z', locked: false },
    { id: 'locked', capturedAt: '2026-09-28T10:00:00Z', locked: true }
  ];
  assert.deepEqual(expiredNormalVideos(records, 3, Date.parse('2026-09-28T10:10:00Z')).map(record => record.id), ['normal']);
});
