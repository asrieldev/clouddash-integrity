import { supabase } from './supabase.js';

async function context() {
  if (!supabase) throw new Error('Sign in to save verification history.');
  const { data: { session }, error } = await supabase.auth.getSession();
  const user = session?.user;
  if (error || !user) throw error || new Error('Sign in to save verification history.');
  let workspaceId = localStorage.getItem(`clouddash-history-workspace:${user.id}`);
  if (!workspaceId) {
  const { data, error: workspaceError } = await supabase.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' });
  if (workspaceError) throw workspaceError;
  workspaceId = data;
  localStorage.setItem(`clouddash-history-workspace:${user.id}`, workspaceId);
  }
  return { workspaceId, userId: user.id, key: `clouddash-verification:${workspaceId}:${user.id}` };
}
const read = key => JSON.parse(localStorage.getItem(key) || '[]');
const write = (key, rows) => localStorage.setItem(key, JSON.stringify(rows));

export async function recordVerification(kind, result) {
  const ctx = await context();
  const { reference, blob: _blob, ...details } = result;
  const row = { id: crypto.randomUUID(), workspace_id: ctx.workspaceId, actor_id: ctx.userId, created_at: new Date().toISOString(), kind, name: result.name || kind, status: result.status || 'ERROR', details: { ...details, referenceId: reference?.id, sessionId: reference?.session_id, segmentId: reference?.segment_id } };
  // Persist before transmitting. A server outage must not discard failed verifications.
  write(ctx.key, [...read(ctx.key), row]);
  window.dispatchEvent(new Event('verification-history-changed'));
  const syncError = await syncRows(ctx);
  return { ...row, syncError };
}

async function syncRows(ctx) {
  for (const row of read(ctx.key)) {
    const { error } = await supabase.from('verification_attempts').insert(row);
    if (error && error.code !== '23505') return error.message;
    write(ctx.key, read(ctx.key).filter(item => item.id !== row.id));
  }
  return null;
}

export async function listVerificationHistory() {
  const ctx = await context();
  const syncError = await syncRows(ctx);
  const rows = [];
  let fetchError;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('verification_attempts').select('*').eq('workspace_id', ctx.workspaceId).order('created_at', { ascending: false }).range(from, from + 999);
    if (error) { fetchError = error.message; break; }
    rows.push(...data); if (data.length < 1000) break;
  }
  const pending = read(ctx.key);
  return { rows: [...new Map([...rows, ...pending].map(row => [row.id, row])).values()].sort((a,b) => b.created_at.localeCompare(a.created_at)), pending: pending.length, error: syncError || fetchError };
}

export function verificationSummary(rows) {
  const attempts = rows.filter(row => ['video', 'incident'].includes(row.kind));
  const errors = attempts.filter(row => row.status === 'ERROR').length;
  const checked = attempts.length - errors;
  const verified = attempts.filter(row => row.status === 'VERIFIED').length;
  return { total: attempts.length, checked, verified, failures: checked - verified, errors, reliability: checked ? 100 * verified / checked : null };
}
