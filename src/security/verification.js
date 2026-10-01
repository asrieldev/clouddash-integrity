import { verifyEvidenceChain, sha256, stableJson } from './chain.js';
import { verifyFingerprintSignature } from './deviceKeys.js';

export function compareVideoHash(calculatedHash, trustedHash) {
  if (!trustedHash) return { status: 'FINGERPRINT_NOT_FOUND', valid: false };
  return calculatedHash === trustedHash
    ? { status: 'VERIFIED', valid: true }
    : { status: 'FILE_HASH_MISMATCH', valid: false, reason: 'The supplied file differs from the trusted reference or is the wrong file.' };
}

export async function verifyTrustedFingerprint(reference, allRecords) {
  if (!reference) return { status: 'FINGERPRINT_NOT_FOUND', valid: false };
  if (Number(reference.version) >= 3 && await sha256(stableJson(reference.perceptual)) !== (reference.perceptualHash ?? reference.perceptual_hash)) return { status: 'PERCEPTUAL_HASH_MISMATCH', valid: false };
  const publicKey = reference.devices?.public_key;
  const signatureValid = publicKey && reference.signature
    ? await verifyFingerprintSignature(publicKey, reference, reference.signature)
    : false;
  if (!signatureValid) return { status: 'INVALID_SIGNATURE', valid: false, signatureValid: false };

  const version = Number(reference.version ?? 1);
  const sessionId = reference.session_id ?? reference.sessionId ?? null;
  const chainRecords = allRecords
    .filter(record => record.device_id === reference.device_id && Number(record.version ?? 1) === version && (version < 2 || (record.session_id ?? record.sessionId) === sessionId) && record.sequence <= reference.sequence)
    .sort((a, b) => a.sequence - b.sequence);
  const chain = await verifyEvidenceChain(chainRecords);
  if (!chain.valid) return { status: chain.status || 'BROKEN_CHAIN', valid: false, signatureValid: true, chain };
  return { status: 'VERIFIED', valid: true, signatureValid: true, chain };
}
