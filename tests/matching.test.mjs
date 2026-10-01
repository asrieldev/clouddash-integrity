import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintFrame, distance, METHODS, thresholdSweep } from '../src/matching/metrics.js';
import { matchVideo } from '../src/matching/alignment.js';
import { evaluateRecovery } from '../src/matching/networkEvaluation.js';
import { verificationSummary } from '../src/verificationHistory.js';
import { createEvidenceSegment, stableJson, sha256 } from '../src/security/chain.js';
import { generateDeviceKeyPair, exportPublicKey, signFingerprint } from '../src/security/deviceKeys.js';
import { verifyTrustedFingerprint } from '../src/security/verification.js';
import { fuzzyFingerprint, compareFuzzy } from '../src/matching/fuzzy.js';
import { ssdeepScore } from '../src/matching/ssdeepScore.js';
import { parseEvidenceManifest } from '../src/security/fingerprintFile.js';

function frame(seed) {
  let state = seed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2**32; };
  const coarse = Array.from({ length: 64 }, () => Math.floor(random() * 255));
  return fingerprintFrame(Array.from({ length: 1024 }, (_, i) => coarse[Math.floor(Math.floor(i/32)/4)*8 + Math.floor(i%32/4)]));
}
const frames = Array.from({ length: 30 }, (_, i) => ({ time: i * .5, ...frame(i * 99991 + 42) }));
const profile = sequence => ({ frames: sequence.map((f,i) => ({ ...f, time: i * .5 })), duration: sequence.length * .5, interval: .5 });

test('all perceptual hashes have 64 bits; identical distance is zero', () => {
  const a = frames[0];
  for (const method of METHODS) { assert.equal(a[method].length, 64); assert.equal(distance(a,a,method,'hamming'),0); assert.equal(distance(a,a,method,'normalizedHamming'),0); }
  for (const metric of ['l1','l2','cosine']) assert.ok(distance(a,a,'pHash',metric) < 1e-9);
  assert.equal(distance({ pHash:'0'.repeat(64) },{ pHash:'1'.repeat(64) },'pHash','hamming'),64);
  assert.equal(distance({ pHash:'0'.repeat(64) },{ pHash:'1'.repeat(64) }),1);
});
test('fuzzy metrics compare binary files and reject low-complexity TLSH inputs', () => {
  const input = Uint8Array.from({length:4096},(_,i)=>(i*i+17*i+43)%256);
  const fingerprint = fuzzyFingerprint(input), result = compareFuzzy(fingerprint,fingerprint);
  assert.equal(result.ssdeepSimilarity,100); assert.equal(result.tlshDistance,0);
  assert.equal(fuzzyFingerprint(new Uint8Array(100)).tlsh,null);
  assert.equal(ssdeepScore('192:ABCDEFGH:abcdefgh','768:ABCDEFGH:abcdefgh'),0);
  assert.equal(ssdeepScore('192:ABCDEFGH:abcdefgh','192:12345678:87654321'),0);
  assert.equal(ssdeepScore('192:ABCDEFGH:abcdefgh','384:abcdefgh:12345678'),100);
});
test('finds a trimmed/extracted segment at its original temporal position', () => {
  const r = matchVideo(profile(frames.slice(6,22)), profile(frames));
  assert.equal(r.match,true); assert.equal(r.referenceStart,3); assert.equal(r.matchedFingerprints,16); assert.equal(r.offsetSeconds,3);
});
test('matches missing and duplicated samples and reports gaps', () => {
  const r = matchVideo(profile(frames.filter((_,i) => i<10 || i>13)),profile(frames));
  assert.equal(r.match,true); assert.ok(r.anomalies.some(x => x.type==='REFERENCE_GAP'));
  const duplicate = matchVideo(profile([...frames.slice(0,10),frames[9],frames[9],...frames.slice(10)]),profile(frames));
  assert.equal(duplicate.match,true); assert.ok(duplicate.anomalies.some(x => x.type==='POSSIBLE_DUPLICATE_OR_STATIC_SCENE'));
});
test('reports speed, replaced sections and reordered content; rejects another trip', () => {
  const faster = profile(frames); faster.frames = faster.frames.map(f => ({ ...f,time:f.time*.9 }));
  const speed = matchVideo(faster,profile(frames)); assert.ok(speed.speedRatio>1.1);
  const modified = matchVideo(profile(frames.map((f,i) => i>=12 && i<17 ? { ...f,...frame(i+98765) } : f)),profile(frames));
  assert.ok(modified.anomalies.some(x=>x.type==='UNMATCHED_SECTION'));
  assert.ok(matchVideo(profile(frames.toReversed()),profile(frames)).anomalies.some(x=>x.type==='POSSIBLE_REORDER'));
  assert.equal(matchVideo(profile(Array.from({length:30},(_,i)=>frame(i+80000))),profile(frames)).match,false);
});
test('flat frames cannot create an accepted match', () => {
  const flat = profile(Array.from({length:10},()=>fingerprintFrame(Array(1024).fill(128))));
  assert.equal(matchVideo(flat,flat).match,false);
});
test('threshold counts distinguish false and missed matches', () => {
  const rows = thresholdSweep([{ distance:.1,expected:true },{ distance:.3,expected:true },{ distance:.2,expected:false }],[.15,.25]);
  assert.deepEqual([rows[0].tp,rows[0].fp,rows[0].fn],[1,0,1]); assert.equal(rows[1].fp,1);
});
test('empty and malformed manifest batches cannot report verification success', () => {
  for (const value of ['[]','null','[null]','{}','42']) assert.equal(parseEvidenceManifest(value).status,'INVALID_MANIFEST');
});
test('all recovery fault scenarios retain and eventually deliver every fingerprint', async () => {
  const rows = await evaluateRecovery(); assert.equal(rows.length,8); assert.ok(rows.every(x=>x.passed));
  assert.equal(rows.find(x=>x.scenario.startsWith('Duplicate')).duplicates,12);
});
test('reliability includes mismatches and not-found but separates errors and non-video checks', () => {
  const s = verificationSummary([{kind:'video',status:'VERIFIED'},{kind:'video',status:'FILE_HASH_MISMATCH'},{kind:'video',status:'FINGERPRINT_NOT_FOUND'},{kind:'video',status:'ERROR'},{kind:'manifest',status:'VERIFIED'},{kind:'evaluation',status:'CONTENT_MATCH'}]);
  assert.equal(s.checked,3); assert.equal(s.failures,2); assert.equal(s.errors,1); assert.equal(s.reliability,100/3); assert.equal(verificationSummary([]).reliability,null);
});
test('signed v3 fingerprints bind canonical perceptual content and reject tampering', async () => {
  const keys = await generateDeviceKeyPair();
  const segment = await createEvidenceSegment({version:3,workspaceId:'w',deviceId:'d',sessionId:'s',segmentId:'x',sequence:0,capturedAt:'2026-09-30T08:00:00Z',bytes:5,contentHash:'a'.repeat(64),perceptual:profile(frames.slice(0,4))});
  segment.signature = await signFingerprint(keys.privateKey,segment);
  const record = {...segment,device_id:'d',devices:{public_key:await exportPublicKey(keys.publicKey)}};
  assert.equal((await verifyTrustedFingerprint(record,[record])).valid,true);
  assert.equal(await sha256(stableJson({b:2,a:1})),await sha256(stableJson({a:1,b:2})));
  const changed = structuredClone(record); changed.perceptual.frames[0].pHash='0'.repeat(64);
  assert.equal((await verifyTrustedFingerprint(changed,[changed])).status,'PERCEPTUAL_HASH_MISMATCH');
});
