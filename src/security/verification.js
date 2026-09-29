import { verifyEvidenceChain } from './chain.js';
import { verifyFingerprintSignature } from './deviceKeys.js';

export function compareVideoHash(calculatedHash, trustedHash) {
  if (!trustedHash) return { status: 'NOT_FOUND', valid: false };
  return calculatedHash === trustedHash
    ? { status: 'VERIFIED', valid: true }
    : { status: 'MISMATCH', valid: false, reason: 'The supplied file differs from the trusted reference or is the wrong file.' };
}

export async function verifyTrustedFingerprint(reference, allRecords) {
  if (!reference) return { status: 'NOT_FOUND', valid: false };
  const publicKey = reference.devices?.public_key;
  const signatureValid = publicKey && reference.signature
    ? await verifyFingerprintSignature(publicKey, reference, reference.signature)
    : false;
  if (!signatureValid) return { status: 'INVALID_SIGNATURE', valid: false, signatureValid: false };

  const chainRecords = allRecords
    .filter(record => record.device_id === reference.device_id && Number(record.version) === 1 && record.sequence <= reference.sequence)
    .sort((a, b) => a.sequence - b.sequence);
  const chain = await verifyEvidenceChain(chainRecords);
  if (!chain.valid) return { status: chain.status === 'MISSING_SEQUENCE' ? 'MISSING_SEQUENCE' : 'BROKEN_CHAIN', valid: false, signatureValid: true, chain };
  return { status: 'VERIFIED', valid: true, signatureValid: true, chain };
}
