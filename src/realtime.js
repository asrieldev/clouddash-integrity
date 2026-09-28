import { requireSupabase } from './supabase';

export function subscribeToEvidence(workspaceId, onSegment, onIncident) {
  const client = requireSupabase();
  return client.channel(`workspace:${workspaceId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evidence_segments', filter: `workspace_id=eq.${workspaceId}` }, onSegment)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents', filter: `workspace_id=eq.${workspaceId}` }, onIncident)
    .subscribe();
}
