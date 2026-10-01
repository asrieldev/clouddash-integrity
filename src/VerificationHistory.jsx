import { useEffect, useState } from 'react';
import { listVerificationHistory, verificationSummary } from './verificationHistory.js';

export default function VerificationHistory() {
  const [state, setState] = useState({ rows: [], pending: 0 });
  const [filter, setFilter] = useState('all');
  const refresh = () => listVerificationHistory().then(setState).catch(error => setState(s => ({ ...s, error: error.message })));
  useEffect(() => {
    refresh(); window.addEventListener('verification-history-changed', refresh); window.addEventListener('online', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { clearInterval(timer); window.removeEventListener('verification-history-changed', refresh); window.removeEventListener('online', refresh); };
  }, []);
  const summary = verificationSummary(state.rows);
  const rows = state.rows.filter(row => filter === 'all' || (filter === 'failures' ? row.status !== 'VERIFIED' : row.status === 'VERIFIED'));
  function exportLog() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.rows, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'verification-history.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="panel verification-history">
    <div className="panel-title"><div><h2>Verification history & reliability</h2><p>Exact-video pass rate: <b>{summary.reliability === null ? 'Not evaluated' : `${summary.reliability.toFixed(1)}%`}</b> · {summary.verified} passed / {summary.checked} completed · {summary.failures} failed · {summary.errors} errors</p></div><button className="button secondary" onClick={refresh}>Refresh log</button></div>
    <p>This is the pass rate of submitted video checks, not a probability of authenticity. Missing references and mismatches count as failures; processing errors are reported separately. Manifest and perceptual checks do not inflate this score.</p>
    {state.error && <p role="status" className="history-warning">Cloud history unavailable: {state.error}. {state.pending} attempt(s) queued in this browser; retry on reconnect.</p>}
    <div className="section-actions"><label>Show <select aria-label="Verification history filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All attempts</option><option value="failures">Failures / review</option><option value="verified">Verified</option></select></label><button className="button secondary" onClick={exportLog}>Export full log</button></div>
    <div className="table-wrap"><table><thead><tr><th>Time / file</th><th>Check</th><th>Result</th><th>Details</th></tr></thead><tbody>{rows.slice(0, 100).map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}<small>{row.name}</small></td><td>{row.kind}</td><td><span className={`badge ${row.status === 'VERIFIED' ? 'success' : 'warning'}`}>{row.status}</span></td><td>{row.details.reason || row.details.observedHash || `${row.details.matched ?? '—'} matched`}</td></tr>)}</tbody></table></div>
    {!rows.length && <p>No verification attempts recorded yet.</p>}{rows.length > 100 && <p>Showing newest 100; export includes all {rows.length} filtered/unfiltered history entries.</p>}
  </section>;
}
