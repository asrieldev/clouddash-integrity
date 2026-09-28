import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvidenceSegment, sha256, verifyEvidenceChain } from '../src/security/chain.js';

test('SHA-256 is deterministic', async () => {
  assert.equal(await sha256('clouddash'), await sha256('clouddash'));
});

test('validates an ordered hash chain', async () => {
  const first = await createEvidenceSegment({ sequence: 0, capturedAt: '2026-09-28T14:00:00Z', bytes: 124 });
  const second = await createEvidenceSegment({ sequence: 1, capturedAt: '2026-09-28T14:00:05Z', bytes: 125, previousHash: first.chainHash });
  assert.deepEqual(await verifyEvidenceChain([first, second]), { valid: true, lastHash: second.chainHash });
});

test('detects a modified chain entry', async () => {
  const first = await createEvidenceSegment({ sequence: 0, capturedAt: '2026-09-28T14:00:00Z', bytes: 124 });
  const compromised = { ...first, chainHash: '0'.repeat(64) };
  assert.equal((await verifyEvidenceChain([compromised])).valid, false);
});
