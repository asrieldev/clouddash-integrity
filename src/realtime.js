import { requireSupabase } from './supabase';

export function subscribeToEvidence(workspaceId, onFingerprint, onIncident, onStatus = () => {}) {
  const client = requireSupabase();
  return client.channel(`workspace:${workspaceId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents', filter: `workspace_id=eq.${workspaceId}` }, onIncident)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fingerprints', filter: `workspace_id=eq.${workspaceId}` }, onFingerprint)
    .subscribe(onStatus);
}
