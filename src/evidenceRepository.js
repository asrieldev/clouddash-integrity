import { requireSupabase } from './supabase';
import { enqueueSegment } from './storage/offlineQueue';

export async function createDevice(workspaceId, label = 'Driver Dashcam') {
  const client = requireSupabase();
  const { data, error } = await client.from('devices').insert({ workspace_id: workspaceId, label, public_key: 'browser-demo-device-key' }).select().single();
  if (error) throw error;
  return data;
}

export async function uploadSegment({ workspaceId, deviceId, segment, blob }) {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  const objectPath = `${user.id}/${deviceId}/${segment.sequence}.webm`;
  try {
    const { error: uploadError } = await client.storage.from('evidence').upload(objectPath, blob, { contentType: 'video/webm', upsert: false });
    if (uploadError) throw uploadError;
    const { error: recordError } = await client.from('evidence_segments').insert({ workspace_id: workspaceId, device_id: deviceId, sequence: segment.sequence, captured_at: segment.capturedAt, object_path: objectPath, sha256: segment.sha256, previous_hash: segment.previousHash, chain_hash: segment.chainHash, bytes: segment.bytes, status: 'transmitted', metadata: segment.metadata });
    if (recordError) throw recordError;
    return { queued: false, objectPath };
  } catch (error) {
    await enqueueSegment({ ...segment, workspaceId, deviceId, blob });
    return { queued: true, error };
  }
}
