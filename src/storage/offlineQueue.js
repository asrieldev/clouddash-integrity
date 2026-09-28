const DB_NAME = 'clouddash-offline';
const STORE = 'segments';

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueSegment(segment) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...segment, id: segment.id || crypto.randomUUID(), queuedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

export async function listQueuedSegments() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.sequence - b.sequence)); request.onerror = () => reject(request.error);
  });
}

export async function flushQueue(upload) {
  const queued = await listQueuedSegments();
  const db = await database();
  for (const segment of queued) {
    await upload(segment);
    await new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(segment.id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
  return queued.length;
}
