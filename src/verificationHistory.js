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

const STATUS_HELP = {
  VERIFIED: ['Passed', 'The file bytes, trusted record, device signature, and session chain all passed.'],
  EVALUATED: ['Completed', 'The evaluation finished. Open the details to review any false or missed matches.'],
  RECOVERY_FAILED: ['Recovery failed', 'One or more simulated network recovery scenarios lost data or did not drain the queue.'],
  CONTENT_MATCH: ['Content match only', 'The visual content is similar, but exact-byte integrity was not verified.'],
  FILE_HASH_MISMATCH: ['File changed', 'The selected video bytes differ from the trusted SHA-256 reference.'],
  FINGERPRINT_NOT_FOUND: ['Reference missing', 'No trusted cloud fingerprint was found for this file or hash.'],
  INVALID_SIGNATURE: ['Invalid signature', 'The evidence signature does not validate against the registered device key.'],
  INVALID_MANIFEST: ['Invalid manifest', 'The manifest is incomplete or differs from the trusted cloud record.'],
  SESSION_MISMATCH: ['Wrong session', 'The manifest or video points to a different capture session.'],
  DEVICE_MISMATCH: ['Wrong device', 'The manifest points to a different registered device.'],
  BROKEN_CHAIN: ['Broken chain', 'A sequence, previous-hash, or chain-hash link is invalid.'],
  MISSING_SEQUENCE: ['Missing segment', 'One or more expected segments are missing from the evidence chain.'],
  REORDERED_SEQUENCE: ['Segments reordered', 'Evidence segments are not in their signed capture order.'],
  DUPLICATE_SEQUENCE: ['Duplicate segment', 'The evidence chain contains a repeated sequence number.'],
  PERCEPTUAL_HASH_MISMATCH: ['Profile changed', 'The stored perceptual profile no longer matches its signed profile hash.'],
  LEGACY_EVIDENCE: ['Review required', 'This older record lacks the current session-scoped verification guarantees.'],
  UNSUPPORTED_OR_DECODE_ERROR: ['Could not decode', 'The browser could not decode or evaluate this video.'],
  ERROR: ['Processing error', 'The check did not finish, so it is not counted as a pass or integrity failure.']
};

export function describeVerification(row) {
  const details = row?.details || {};
  const status = row?.status || 'ERROR';
  const [title, fallback] = STATUS_HELP[status] || [status.replaceAll('_', ' ').toLowerCase(), 'The check needs review.'];
  const failures = Number(details.failures ?? details.problemCount ?? 0);
  const cases = Number(details.cases ?? details.total ?? 0);
  const issueCounts = details.issueCounts || {};
  const issueText = Object.entries(issueCounts).filter(([, count]) => count).map(([name, count]) => `${count} ${name.replaceAll('_', ' ').toLowerCase()}`).join(', ');
  let problem = details.problem || details.reason || fallback;
  if (status === 'EVALUATED') {
    problem = failures
      ? `${failures} problem decision${failures === 1 ? '' : 's'} found${issueText ? `: ${issueText}` : ''}.`
      : `No false or missed matches were found${cases ? ` across ${cases} decisions` : ''}.`;
  } else if (details.missing?.length) {
    problem = `${details.missing.length} fingerprint${details.missing.length === 1 ? '' : 's'} were not found in trusted cloud history.`;
  }
  const evidence = [
    details.observedHash && `Observed SHA-256: ${details.observedHash}`,
    details.referenceId && `Reference: ${details.referenceId}`,
    details.sessionId && `Session: ${details.sessionId}`,
    details.segmentId && `Segment: ${details.segmentId}`,
    details.matched != null && details.total != null && `Matched: ${details.matched}/${details.total}`,
    details.affectedFiles?.length && `Affected files: ${details.affectedFiles.join(', ')}`
  ].filter(Boolean);
  return { title, problem, evidence, isPass: status === 'VERIFIED' || (status === 'EVALUATED' && failures === 0), isError: status === 'ERROR' || status === 'UNSUPPORTED_OR_DECODE_ERROR' };
}

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
