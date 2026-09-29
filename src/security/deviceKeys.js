import { canonicalFingerprintPayload } from './chain.js';

const DB_NAME = 'clouddash-device-keys';
const STORE = 'keys';

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function generateDeviceKeyPair() {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
}

export async function exportPublicKey(publicKey) {
  return crypto.subtle.exportKey('jwk', publicKey);
}

export async function signFingerprint(privateKey, fingerprint) {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(canonicalFingerprintPayload(fingerprint))
  );
  return bytesToBase64(new Uint8Array(signature));
}

export async function verifyFingerprintSignature(publicKeyJwk, fingerprint, signature) {
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      typeof publicKeyJwk === 'string' ? JSON.parse(publicKeyJwk) : publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64ToBytes(signature),
      new TextEncoder().encode(canonicalFingerprintPayload(fingerprint))
    );
  } catch {
    return false;
  }
}

export async function getOrCreateDeviceKeyPair(deviceId) {
  const db = await database();
  const existing = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(deviceId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (existing) return existing;

  const pair = await generateDeviceKeyPair();
  const record = { id: deviceId, privateKey: pair.privateKey, publicKey: pair.publicKey, publicJwk: await exportPublicKey(pair.publicKey) };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return record;
}

export async function getStoredDeviceKeyPair(deviceId) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(deviceId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
