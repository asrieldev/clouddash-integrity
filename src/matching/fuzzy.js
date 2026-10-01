import ssdeep from 'ssdeep.js';
import tlsh from 'tlsh';
import DigestHashBuilder from 'tlsh/lib/digests/digest-hash-builder.js';
import { ssdeepScore } from './ssdeepScore.js';

// Binary-safe Latin-1 mapping: each character represents one byte, never UTF-8 text decoding.
function binaryString(bytes) {
  const chunks = [];
  for (let at = 0; at < bytes.length; at += 8192) chunks.push(String.fromCharCode(...bytes.subarray(at, at + 8192)));
  return chunks.join('');
}
export function fuzzyFingerprint(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const result = { ssdeep: ssdeep.digest(bytes), tlsh: null, tlshError: null };
  try { result.tlsh = tlsh(binaryString(bytes)); }
  catch (error) { result.tlshError = error.message || 'Insufficient length or entropy'; }
  return result;
}
export function compareFuzzy(a, b) {
  return {
    ssdeepSimilarity: ssdeepScore(a.ssdeep, b.ssdeep),
    tlshDistance: a.tlsh && b.tlsh ? new DigestHashBuilder().withHash(a.tlsh).build().calculateDifference(new DigestHashBuilder().withHash(b.tlsh).build(), true) : null,
    tlshError: a.tlshError || b.tlshError,
    implementation: 'ssdeep.js 0.0.3 / tlsh 1.0.8 (legacy 70-character digest)',
  };
}
export function fuzzyThresholds(rows) {
  const results = [];
  for (const [metric, thresholds, higher] of [['ssdeepSimilarity', [10,25,50,75,90,100], true], ['tlshDistance', [0,25,50,100,150,200,300], false]]) {
    const samples = rows.filter(r => Number.isFinite(r[metric]));
    if (!samples.length) continue;
    for (const threshold of thresholds) {
      let tp=0,fp=0,tn=0,fn=0;
      for (const sample of samples) { const match = higher ? sample[metric] >= threshold : sample[metric] <= threshold; if (sample.expected) match ? tp++ : fn++; else match ? fp++ : tn++; }
      results.push({ metric, threshold, tp,fp,tn,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):0 });
    }
  }
  return results;
}
