import { requireSupabase } from './supabase';

export async function getDashboardMetrics() {
  const client = requireSupabase();
  const { data: workspaceId, error: workspaceError } = await client.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' });
  if (workspaceError) throw workspaceError;
  const [fingerprints, incidents, incidentVideos] = await Promise.all([
    client.from('fingerprints').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    client.from('incidents').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'open'),
    client.from('incident_videos').select('bytes').eq('workspace_id', workspaceId)
  ]);
  const error = fingerprints.error || incidents.error || incidentVideos.error;
  if (error) throw error;
  return {
    evidenceProcessed: fingerprints.count || 0,
    openIncidents: incidents.count || 0,
    integrityRate: null,
    storedIncidentBytes: (incidentVideos.data || []).reduce((sum, row) => sum + Number(row.bytes || 0), 0)
  };
}
