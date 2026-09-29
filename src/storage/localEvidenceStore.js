const DB_NAME = 'clouddash-local-evidence';
const STORE = 'videos';

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('deviceId', 'deviceId');
      store.createIndex('capturedAt', 'capturedAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function saveLocalVideo(record) {
  return transact('readwrite', store => store.put({ ...record, state: record.state || 'LOCAL' }));
}

export function getLocalVideo(id) {
  return transact('readonly', store => store.get(id));
}

export async function listLocalVideos(deviceId) {
  const records = await transact('readonly', store => store.getAll());
  return records
    .filter(record => !deviceId || record.deviceId === deviceId)
    .sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
}

export async function updateLocalVideo(id, patch) {
  const record = await getLocalVideo(id);
  if (!record) return null;
  const updated = { ...record, ...patch, id };
  await saveLocalVideo(updated);
  return updated;
}

export function deleteLocalVideo(id) {
  return transact('readwrite', store => store.delete(id));
}

export function expiredNormalVideos(records, retentionMinutes, now = Date.now()) {
  const cutoff = now - Number(retentionMinutes) * 60_000;
  return records.filter(record => !record.locked && new Date(record.capturedAt).getTime() < cutoff);
}

export async function purgeExpiredVideos(retentionMinutes, now = Date.now()) {
  const records = await listLocalVideos();
  const expired = expiredNormalVideos(records, retentionMinutes, now);
  await Promise.all(expired.map(record => deleteLocalVideo(record.id)));
  return { deleted: expired.map(record => record.id), bytes: expired.reduce((sum, record) => sum + Number(record.bytes || 0), 0) };
}

export async function totalLocalBytes(deviceId) {
  const records = await listLocalVideos(deviceId);
  return records.reduce((sum, record) => sum + Number(record.bytes || 0), 0);
}
