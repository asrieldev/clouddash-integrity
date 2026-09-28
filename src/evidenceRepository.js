import { requireSupabase } from './supabase';
import { enqueueSegment } from './storage/offlineQueue';

export async function createDevice(workspaceId, label = 'Driver Dashcam') {
  const client = requireSupabase();
  const { data, error } = await client.from('devices').insert({ workspace_id: workspaceId, label, public_key: 'browser-demo-device-key' }).select().single();
  if (error) throw error;
  return data;
}

async function persistSegment({ workspaceId, deviceId, segment, blob }) {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  const stamp = segment.capturedAt.replace(/[-:.TZ]/g, '');
  const extension = segment.metadata?.extension === 'mp4' ? 'mp4' : 'webm';
  const objectPath = `${user.id}/${deviceId}/${stamp}-${segment.sequence}.${extension}`;
  const { error: uploadError } = await client.storage.from('evidence').upload(objectPath, blob, { contentType: blob.type || segment.metadata?.mimeType || 'video/webm', upsert: true });
  if (uploadError) throw uploadError;
  const { error: recordError } = await client.from('evidence_segments').upsert({ workspace_id: workspaceId, device_id: deviceId, sequence: segment.sequence, captured_at: segment.capturedAt, object_path: objectPath, sha256: segment.sha256, previous_hash: segment.previousHash, chain_hash: segment.chainHash, bytes: segment.bytes, status: 'transmitted', metadata: segment.metadata }, { onConflict: 'device_id,sequence' });
  if (recordError) throw recordError;
  return { queued: false, objectPath };
}

export async function uploadSegment({ workspaceId, deviceId, segment, blob }) {
  try {
    return await persistSegment({ workspaceId, deviceId, segment, blob });
  } catch (error) {
    await enqueueSegment({ ...segment, workspaceId, deviceId, blob });
    return { queued: true, error };
  }
}

export async function uploadQueuedSegment({ workspaceId, deviceId, segment, blob }) {
  return persistSegment({ workspaceId, deviceId, segment, blob });
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
