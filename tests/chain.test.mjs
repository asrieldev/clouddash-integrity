import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvidenceSegment, sha256, verifyEvidenceChain } from '../src/security/chain.js';

const identity = { workspaceId: 'workspace-1', deviceId: 'device-1' };

test('SHA-256 is deterministic', async () => {
  assert.equal(await sha256('clouddash'), await sha256('clouddash'));
});

test('validates an ordered hash chain', async () => {
  const first = await createEvidenceSegment({ ...identity, sequence: 0, capturedAt: '2026-09-28T14:00:00Z', bytes: 124 });
  const second = await createEvidenceSegment({ ...identity, sequence: 1, capturedAt: '2026-09-28T14:00:05Z', bytes: 125, previousHash: first.chainHash });
  assert.deepEqual(await verifyEvidenceChain([first, second]), { valid: true, lastHash: second.chainHash });
});

test('uses a supplied video fingerprint in the chain', async () => {
  const contentHash = await sha256('recorded-video-bytes');
  const segment = await createEvidenceSegment({ ...identity, sequence: 0, capturedAt: '2026-09-28T14:00:00Z', bytes: 20, contentHash });
  assert.equal(segment.sha256, contentHash);
  assert.equal((await verifyEvidenceChain([segment])).valid, true);
});

test('detects a modified chain entry', async () => {
  const first = await createEvidenceSegment({ ...identity, sequence: 0, capturedAt: '2026-09-28T14:00:00Z', bytes: 124 });
  const compromised = { ...first, chainHash: '0'.repeat(64) };
  assert.equal((await verifyEvidenceChain([compromised])).valid, false);
});
