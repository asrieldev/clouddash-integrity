import { requireSupabase } from './supabase';

export async function listFingerprints(workspaceId) {
  const { data, error } = await requireSupabase()
    .from('fingerprints')
    .select('id, workspace_id, device_id, sequence, sha256, captured_at, source, devices(label)')
    .eq('workspace_id', workspaceId)
    .order('sequence', { ascending: true });
  if (error) throw error;
  return data;
}

export async function storeFingerprint(fingerprint) {
  const { data, error } = await requireSupabase()
    .from('fingerprints')
    .upsert(fingerprint, { onConflict: 'device_id,sequence' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
