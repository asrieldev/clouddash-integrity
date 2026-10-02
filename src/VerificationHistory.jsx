import { useEffect, useState } from 'react';
import { describeVerification, listVerificationHistory, verificationSummary } from './verificationHistory.js';

export default function VerificationHistory({ compact = false }) {
  const [state, setState] = useState({ rows: [], pending: 0 });
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const pageSize = compact ? 6 : 15;
  const refresh = () => listVerificationHistory().then(setState).catch(error => setState(s => ({ ...s, error: error.message })));
  useEffect(() => {
    refresh(); window.addEventListener('verification-history-changed', refresh); window.addEventListener('online', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { clearInterval(timer); window.removeEventListener('verification-history-changed', refresh); window.removeEventListener('online', refresh); };
  }, []);
  const summary = verificationSummary(state.rows);
  const rows = state.rows.filter(row => filter === 'all' || (filter === 'failures' ? row.status !== 'VERIFIED' : row.status === 'VERIFIED'));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  function exportLog() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.rows, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'verification-history.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="panel verification-history">
    <div className="panel-title"><div><h2>Verification history & reliability</h2><p>Exact-video pass rate: <b>{summary.reliability === null ? 'Not evaluated' : `${summary.reliability.toFixed(1)}%`}</b> · {summary.verified} passed / {summary.checked} completed · {summary.failures} failed · {summary.errors} errors</p></div><button className="button secondary" onClick={refresh}>Refresh log</button></div>
    <details className="history-explanation"><summary>How reliability is calculated</summary><p>The pass rate includes completed exact-video checks. Missing references and mismatches count as failures; processing errors are separate. This is not a probability of authenticity.</p></details>
    {state.error && <p role="status" className="history-warning">Cloud history unavailable: {state.error}. {state.pending} attempt(s) queued in this browser; retry on reconnect.</p>}
    <div className="section-actions"><label>Show <select aria-label="Verification history filter" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="all">All attempts</option><option value="failures">Failures / review</option><option value="verified">Verified</option></select></label><button className="button secondary" onClick={exportLog}>Export full log</button></div>
    <div className="table-wrap"><table><thead><tr><th>Time / file</th><th>Check</th><th>Result</th><th>What happened</th></tr></thead><tbody>{rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => {
      const explanation = describeVerification(row);
      return <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}<small title={row.name}>{row.name?.split('/').at(-1)}</small></td><td>{row.kind}</td><td><span className={`badge ${explanation.isPass ? 'success' : explanation.isError ? 'neutral' : 'warning'}`}>{explanation.title}</span><small>{row.status}</small></td><td className="history-detail"><b>{explanation.problem}</b>{explanation.evidence.length > 0 && <details><summary>Technical details</summary>{explanation.evidence.map(item => <small key={item}>{item}</small>)}</details>}</td></tr>;
    })}</tbody></table></div>
    {!rows.length && <p>No verification attempts recorded yet.</p>}{rows.length > pageSize && <div className="history-pagination"><span>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, rows.length)} of {rows.length} attempts</span><button className="button secondary" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="button secondary" disabled={(currentPage + 1) * pageSize >= rows.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
  </section>;
}

