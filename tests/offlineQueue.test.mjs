import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueueSegment, listQueuedSegments, flushQueue, clearQueuedSegments } from '../src/storage/offlineQueue.js';

test('persistent IndexedDB outbox survives failed sends and lost acknowledgements', async () => {
  const deviceId = 'network-test-device';
  await clearQueuedSegments(deviceId);
  for (let i = 0; i < 5; i++) await enqueueSegment({ fingerprint: { deviceId, segmentId:`network-${i}`, sessionId:'session', sequence:i, sha256:`hash-${i}` } });
  const server = new Map();
  const failure = await flushQueue(async row => { server.set(row.id,row.fingerprint.sha256); throw new Error('Acknowledgement lost'); }, () => {}, deviceId);
  assert.equal(failure.failed,5);
  const retained = await listQueuedSegments(deviceId);
  assert.equal(retained.length,5); assert.ok(retained.every(row=>row.state==='FAILED' && row.attempts===1));
  const recovered = await flushQueue(async row => { assert.equal(server.get(row.id),row.fingerprint.sha256); }, () => {}, deviceId);
  assert.equal(recovered.sent,5); assert.equal((await listQueuedSegments(deviceId)).length,0); assert.equal(server.size,5);
});

test('identity conflicts remain quarantined while another device stays isolated', async () => {
  await enqueueSegment({ fingerprint:{deviceId:'conflict-device',segmentId:'conflict',sequence:0} });
  await enqueueSegment({ fingerprint:{deviceId:'other-device',segmentId:'other',sequence:0} });
  await flushQueue(async () => { throw Object.assign(new Error('Conflict'),{code:'EVIDENCE_IDENTITY_CONFLICT'}); },()=>{},'conflict-device');
  const result = await flushQueue(async()=>assert.fail('Quarantined item must not be transmitted'),()=>{},'conflict-device');
  assert.equal(result.skipped,1); assert.equal((await listQueuedSegments('other-device')).length,1);
  await clearQueuedSegments('conflict-device'); await clearQueuedSegments('other-device');
});
