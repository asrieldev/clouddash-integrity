import { requireSupabase } from './supabase.js';

export function toFingerprintRow(fingerprint) {
  return {
    version: Number(fingerprint.version ?? 1),
    workspace_id: fingerprint.workspaceId ?? fingerprint.workspace_id,
    device_id: fingerprint.deviceId ?? fingerprint.device_id,
    sequence: Number(fingerprint.sequence),
    bytes: Number(fingerprint.bytes),
    sha256: fingerprint.sha256,
    captured_at: fingerprint.capturedAt ?? fingerprint.captured_at,
    previous_hash: fingerprint.previousHash ?? fingerprint.previous_hash ?? null,
    chain_hash: fingerprint.chainHash ?? fingerprint.chain_hash,
    signature: fingerprint.signature,
    signature_algorithm: fingerprint.signatureAlgorithm ?? fingerprint.signature_algorithm ?? 'ECDSA_P256_SHA256',
    source: fingerprint.source || 'recorded-video-segment'
  };
}

function safeRepositoryError(error) {
  if (error?.code === '42501') return new Error('Supabase rejected the fingerprint. Check workspace membership, device ownership, and RLS policies.');
  if (error?.code === '23505') return new Error('A different fingerprint already uses this device sequence. Recording was not overwritten.');
  return new Error(error?.message || 'Fingerprint transmission failed.');
}

export async function listFingerprints(workspaceId) {
  const { data, error } = await requireSupabase()
    .from('fingerprints')
    .select('id, version, workspace_id, device_id, sequence, bytes, sha256, captured_at, received_at, created_at, previous_hash, chain_hash, signature, signature_algorithm, source, devices(label, public_key)')
    .eq('workspace_id', workspaceId)
    .order('captured_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function storeFingerprint(fingerprint) {
  const client = requireSupabase();
  const row = toFingerprintRow(fingerprint);
  const { data, error } = await client
    .from('fingerprints')
    .insert(row)
    .select()
    .single();
  if (error?.code === '23505') {
    const { data: existing, error: lookupError } = await client
      .from('fingerprints')
      .select('*')
      .eq('device_id', row.device_id)
      .eq('sequence', row.sequence)
      .maybeSingle();
    if (lookupError) throw safeRepositoryError(lookupError);
    if (existing && existing.sha256 === row.sha256 && existing.chain_hash === row.chain_hash && existing.signature === row.signature) {
      return { ...existing, idempotent: true };
    }
  }
  if (error) throw safeRepositoryError(error);
  return data;
}

export async function latestFingerprint(deviceId) {
  const { data, error } = await requireSupabase()
    .from('fingerprints')
    .select('*')
    .eq('device_id', deviceId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw safeRepositoryError(error);
  return data;
}

export async function createIncident(workspaceId, deviceId) {
  const { data, error } = await requireSupabase().from('incidents').insert({
    workspace_id: workspaceId,
    device_id: deviceId,
    title: 'Driver-locked dashcam incident',
    severity: 'high',
    status: 'open'
  }).select().single();
  if (error) throw safeRepositoryError(error);
  return data;
}

export async function uploadIncidentVideo({ workspaceId, deviceId, incidentId, segment, blob }) {
  const client = requireSupabase();
  const extension = segment.mimeType?.includes('mp4') ? 'mp4' : 'webm';
  const storagePath = `${workspaceId}/${deviceId}/${incidentId}/${segment.sequence}.${extension}`;
  const { error: uploadError } = await client.storage.from('evidence').upload(storagePath, blob, {
    contentType: segment.mimeType || blob.type || 'video/webm',
    upsert: false
  });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message || '')) throw safeRepositoryError(uploadError);

  const row = {
    workspace_id: workspaceId,
    device_id: deviceId,
    incident_id: incidentId,
    sequence: segment.sequence,
    fingerprint_id: segment.fingerprintId,
    captured_at: segment.capturedAt,
    storage_path: storagePath,
    bytes: segment.bytes,
    mime_type: segment.mimeType || blob.type || 'video/webm',
    sha256: segment.sha256,
    signature: segment.signature
  };
  const { data, error } = await client.from('incident_videos').insert(row).select().single();
  if (error?.code === '23505') {
    const { data: existing } = await client.from('incident_videos').select('*').eq('storage_path', storagePath).maybeSingle();
    if (existing?.sha256 === row.sha256) return { ...existing, idempotent: true };
  }
  if (error) throw safeRepositoryError(error);
  return data;
}

export async function listIncidentVideos(workspaceId) {
  const { data, error } = await requireSupabase().from('incident_videos')
    .select('*, devices(label, public_key)')
    .eq('workspace_id', workspaceId)
    .order('captured_at', { ascending: false });
  if (error) throw safeRepositoryError(error);
  return data;
}

export async function downloadIncidentVideo(storagePath) {
  const { data, error } = await requireSupabase().storage.from('evidence').download(storagePath);
  if (error) throw safeRepositoryError(error);
  return data;
}
