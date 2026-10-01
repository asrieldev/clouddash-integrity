import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyVideoMetrics } from '../src/matching/verifyMetrics.js';

test('downloaded video verification runs every metric against its trusted recording', async () => {
  const calls = [];
  const reference = { perceptual: { frames: [{}] } };
  const result = await verifyVideoMetrics({}, reference, true, {
    extract: async () => ({ frames: [{}] }),
    match: async (query, refs, options) => { calls.push(options); assert.equal(refs[0], reference.perceptual); return [{ ...options, status: 'CONTENT_MATCH' }]; },
  });
  assert.equal(result.rows.length, 11);
  assert.equal(calls.filter(c => c.metric === 'hamming').length, 4);
  assert.equal(calls.filter(c => c.metric === 'normalizedHamming').length, 4);
  assert.deepEqual(calls.slice(8).map(c => c.metric), ['l1','l2','cosine']);
});

test('missing, unsigned and legacy profiles cannot silently pass similarity checks', async () => {
  const dependencies = { extract: async () => { throw new Error('must not decode'); } };
  for (const [reference, trusted] of [[null,false],[{perceptual:{frames:[{}]}},false],[{},true]]) {
    const result = await verifyVideoMetrics({}, reference, trusted, dependencies);
    assert.equal(result.rows.length, 0);
    assert.ok(result.reason);
    assert.ok(!result.reason.includes('must not decode'));
  }
});

test('unsupported decoding is reported separately without throwing away exact verification', async () => {
  const result = await verifyVideoMetrics({}, {perceptual:{frames:[{}]}}, true, {extract: async () => {throw new Error('unsupported codec');}});
  assert.match(result.reason, /unsupported codec/);
  assert.deepEqual(result.rows, []);
});
