import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFingerprintFile } from '../src/security/fingerprintFile.js';

test('parses one SHA-256 fingerprint per text line', () => {
  const hash = 'a'.repeat(64);
  assert.deepEqual(parseFingerprintFile(`${hash}\n\n${'B'.repeat(64)}\n`), {
    fingerprints: [hash, 'b'.repeat(64)],
    invalidLines: [],
  });
});

test('reports malformed fingerprint lines', () => {
  assert.deepEqual(parseFingerprintFile(`${'c'.repeat(64)}\nnot-a-hash\n123`), {
    fingerprints: ['c'.repeat(64)],
    invalidLines: [2, 3],
  });
});
