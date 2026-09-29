import { requireSupabase } from './supabase';

export async function createDevice(workspaceId, ownerId, publicKey, label = 'Driver Dashcam', id = crypto.randomUUID()) {
  const client = requireSupabase();
  const { data, error } = await client.from('devices').insert({ id, workspace_id: workspaceId, owner_id: ownerId, label, public_key: JSON.stringify(publicKey), signature_algorithm: 'ECDSA_P256_SHA256' }).select().single();
  if (error) throw error;
  return data;
}

export async function listEvidenceSegments() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('evidence_segments')
    .select('id, device_id, sequence, captured_at, object_path, sha256, previous_hash, chain_hash, bytes, status, locked, devices(label)')
    .order('captured_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function downloadEvidenceSegment(objectPath) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from('evidence').download(objectPath);
  if (error) throw error;
  return data;
}
