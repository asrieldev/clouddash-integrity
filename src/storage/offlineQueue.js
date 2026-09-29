const DB_NAME = 'clouddash-offline';
const STORE = 'segments';
const VERSION = 2;

export const OUTBOX_STATES = Object.freeze({ QUEUED: 'QUEUED', SENDING: 'SENDING', FAILED: 'FAILED' });

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE)
        ? request.transaction.objectStore(STORE)
        : request.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!store.indexNames.contains('state')) store.createIndex('state', 'state');
      if (!store.indexNames.contains('deviceId')) store.createIndex('deviceId', 'deviceId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function sequenceOf(item) {
  return Number(item.fingerprint?.sequence ?? item.sequence ?? -1);
}

function captureTimeOf(item) {
  const value = item.fingerprint?.capturedAt ?? item.fingerprint?.captured_at ?? item.queuedAt;
  const time = Date.parse(value || '');
  return Number.isNaN(time) ? 0 : time;
}

export function queueItemId(item) {
  const fingerprint = item.fingerprint || item;
  return fingerprint.segmentId ?? fingerprint.segment_id ?? `${fingerprint.deviceId ?? fingerprint.device_id}:${fingerprint.sequence}`;
}

export function dedupeQueueItems(items) {
  const byId = new Map();
  for (const item of items) byId.set(queueItemId(item), item);
  return [...byId.values()].sort((a, b) => captureTimeOf(a) - captureTimeOf(b) || sequenceOf(a) - sequenceOf(b));
}

export function normalizeQueuedSegments(records, deviceId) {
  const normalized = records.map(item => ({
    ...item,
    fingerprint: item.fingerprint || item,
    deviceId: item.deviceId || item.fingerprint?.deviceId || item.fingerprint?.device_id || item.device_id,
    state: item.state === OUTBOX_STATES.SENDING ? OUTBOX_STATES.QUEUED : (item.state || OUTBOX_STATES.QUEUED)
  }));
  return dedupeQueueItems(deviceId ? normalized.filter(item => item.deviceId === deviceId) : normalized);
}

async function write(record) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function remove(id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function enqueueSegment(segment) {
  const fingerprint = segment.fingerprint || segment;
  const id = queueItemId({ fingerprint });
  return write({
    ...segment,
    id,
    deviceId: fingerprint.deviceId ?? fingerprint.device_id,
    sessionId: fingerprint.sessionId ?? fingerprint.session_id ?? null,
    segmentId: fingerprint.segmentId ?? fingerprint.segment_id ?? null,
    fingerprint,
    state: OUTBOX_STATES.QUEUED,
    queuedAt: new Date().toISOString(),
    attempts: segment.attempts || 0,
    lastError: null
  });
}

export async function listQueuedSegments(deviceId) {
  const db = await database();
  const records = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return normalizeQueuedSegments(records, deviceId);
}

export async function clearQueuedSegments(deviceId) {
  const queued = await listQueuedSegments(deviceId);
  await Promise.all(queued.map(item => remove(item.id)));
  return queued.length;
}

export async function flushQueue(upload, onChange = () => {}, deviceId) {
  const queued = await listQueuedSegments(deviceId);
  const retryable = queued.filter(item => item.errorCode !== 'EVIDENCE_IDENTITY_CONFLICT');
  const result = { sent: 0, failed: 0, skipped: queued.length - retryable.length, failures: [] };
  for (const item of retryable) {
    const sending = { ...item, state: OUTBOX_STATES.SENDING, attempts: (item.attempts || 0) + 1, lastError: null };
    await write(sending);
    await onChange(sending);
    try {
      await upload(sending);
      await remove(item.id);
      result.sent += 1;
      await onChange({ ...sending, state: 'SENT' });
    } catch (error) {
      const failed = { ...sending, state: OUTBOX_STATES.FAILED, lastError: error?.message || 'Transmission failed', errorCode: error?.code || null };
      await write(failed);
      result.failed += 1;
      result.failures.push(failed);
      await onChange(failed);
    }
  }
  return result;
}
