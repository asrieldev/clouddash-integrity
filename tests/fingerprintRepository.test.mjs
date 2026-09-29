import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvidenceSegment, sha256, verifyEvidenceChain } from '../src/security/chain.js';
import { exportPublicKey, generateDeviceKeyPair, signFingerprint, verifyFingerprintSignature } from '../src/security/deviceKeys.js';
import { toFingerprintRow } from '../src/fingerprintRepository.js';

test('creates, signs, maps, and verifies a repository fingerprint', async () => {
  const fingerprint = await createEvidenceSegment({
    workspaceId: 'workspace-1',
    deviceId: 'device-1',
    sequence: 0,
    capturedAt: '2026-09-29T12:00:00Z',
    bytes: 42,
    contentHash: await sha256('video bytes')
  });
  const pair = await generateDeviceKeyPair();
  fingerprint.signatureAlgorithm = 'ECDSA_P256_SHA256';
  fingerprint.signature = await signFingerprint(pair.privateKey, fingerprint);
  const row = toFingerprintRow(fingerprint);
  assert.equal(row.workspace_id, fingerprint.workspaceId);
  assert.equal(row.chain_hash, fingerprint.chainHash);
  assert.equal(row.bytes, 42);
  assert.equal(await verifyFingerprintSignature(await exportPublicKey(pair.publicKey), row, row.signature), true);

  const supabaseRow = { ...row, captured_at: '2026-09-29T12:00:00.000+00:00' };
  assert.equal(await verifyFingerprintSignature(await exportPublicKey(pair.publicKey), supabaseRow, row.signature), true);
  assert.equal((await verifyEvidenceChain([supabaseRow])).valid, true);
});
