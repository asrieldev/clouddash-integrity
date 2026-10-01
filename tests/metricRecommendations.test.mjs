import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendThresholds } from '../src/matching/recommendations.js';
import { build } from 'esbuild';

test('threshold suggestions require both classes and select highest F1', () => {
  const base = { method: 'pHash', metric: 'hamming', tp: 8, fn: 2, fp: 0, tn: 10 };
  const results = recommendThresholds([{ ...base, threshold: 6 }, { ...base, threshold: 12, tp: 10, fn: 0 }, { ...base, threshold: 18, tp: 10, fn: 0, fp: 4, tn: 6 }]);
  assert.equal(results[0].threshold, 12);
  assert.equal(results[0].f1, 1);
  assert.equal(recommendThresholds([{ ...base, threshold: 12, tn: 0 }])[0].threshold, undefined);
});

test('fuzzy hashing works in a strict browser bundle without leaked loop counters', async () => {
  const result = await build({ entryPoints: ['src/matching/fuzzy.js'], bundle: true, platform: 'browser', format: 'esm', write: false });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  const bytes = Uint8Array.from({ length: 4096 }, (_, i) => (i*i+17*i+43)%256);
  const hash = module.fuzzyFingerprint(bytes);
  assert.equal(hash.tlshError, null);
  assert.ok(hash.tlsh);
  assert.equal(module.compareFuzzy(hash, hash).tlshDistance, 0);
  assert.equal(module.compareFuzzy(hash, hash).ssdeepSimilarity, 100);
});
