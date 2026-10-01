import { drainOutbox, normalizeQueuedSegments } from '../storage/offlineQueue.js';

export async function evaluateRecovery() {
  const reports = [];
  for (const scenario of ['Temporary Internet loss', 'Intermittent connectivity', 'Generated offline', 'Server unavailable', 'Server downtime during send', 'Recovery after outage', 'Out-of-order arrivals', 'Duplicate retry after lost acknowledgement']) {
    const started = performance.now(), generated = 12, queue = new Map(), received = new Map(); let duplicates = 0;
    for (let i = 0; i < generated; i++) queue.set(String(i), { id: String(i), state: 'QUEUED', fingerprint: { segmentId: String(i), deviceId: 'evaluation', sequence: i, sha256: `hash-${i}` } });
    const storage = { write: async row => queue.set(row.id, structuredClone(row)), remove: async id => queue.delete(id) };
    let disconnected = true;
    const upload = async row => {
      const seq = row.fingerprint.sequence;
      const intermittent = scenario === 'Intermittent connectivity' && seq % 2 === 0;
      const downtime = scenario === 'Server downtime during send' && seq >= 4;
      const lossAck = scenario === 'Duplicate retry after lost acknowledgement';
      if (disconnected && !lossAck && (intermittent || downtime || !['Intermittent connectivity','Server downtime during send','Out-of-order arrivals'].includes(scenario))) throw new Error('Injected connection failure');
      if (received.has(row.id)) {
        if (received.get(row.id).fingerprint.sha256 !== row.fingerprint.sha256) throw Object.assign(new Error('Identity conflict'), { code: 'EVIDENCE_IDENTITY_CONFLICT' });
        duplicates++;
      } else received.set(row.id, row);
      if (disconnected && lossAck) throw new Error('Server accepted; acknowledgement lost');
    };
    let rows = normalizeQueuedSegments([...queue.values()]);
    if (scenario === 'Out-of-order arrivals') rows.reverse();
    await drainOutbox(rows, storage, upload);
    const bufferedAfterFailure = queue.size;
    disconnected = false;
    await drainOutbox(normalizeQueuedSegments([...queue.values()]), storage, upload);
    const sequences = [...received.values()].map(row => row.fingerprint.sequence).sort((a,b) => a-b);
    const lost = generated - received.size - queue.size;
    reports.push({ scenario, generated, received: received.size, bufferedAfterFailure, pending: queue.size, duplicates, lost, passed: received.size === generated && !queue.size && !lost && sequences.every((v,i) => v === i), processingMs: performance.now() - started });
  }
  return reports;
}
