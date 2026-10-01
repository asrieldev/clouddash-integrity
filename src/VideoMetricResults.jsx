export default function VideoMetricResults({ result }) {
  if (!result) return null;
  const metrics = result.metrics;
  return <section className="panel"><h2>Video fingerprint comparison · {result.name}</h2>
    <p>Exact integrity: <b>{result.status}</b>. Similarity results are separate from signature, chain and SHA-256 verification.</p>
    {metrics?.reason && <p role="status">{metrics.reason}</p>}
    {!!metrics?.rows?.length && <><p>Experimental thresholds: lower distance is closer. A content match also requires three informative frames and 70% aligned coverage. Calibrate thresholds in the Evaluation Lab using matching and non-matching videos.</p>
      <div className="table-wrap"><table><thead><tr><th>Fingerprint</th><th>Metric</th><th>Mean aligned distance</th><th>Maximum distance</th><th>Matched frames</th><th>Content result</th></tr></thead><tbody>{metrics.rows.map(r => <tr key={`${r.label}/${r.metric}`}><td>{r.label}</td><td>{r.metric}</td><td>{r.meanDistance?.toFixed(4) ?? 'No aligned frames'}{r.metric === 'cosine' && r.meanDistance != null && <small>Similarity {(1-r.meanDistance).toFixed(4)}</small>}</td><td>≤ {r.threshold}</td><td>{r.matchedFingerprints}/{r.totalFingerprints} ({r.matchedPercentage.toFixed(1)}%)</td><td>{r.status}</td></tr>)}</tbody></table></div>
      <h3>File fuzzy hashes</h3><p>These compare encoded file bytes. They do not measure visual similarity directly.</p><div className="table-wrap"><table><thead><tr><th>Metric</th><th>Measured value</th><th>Interpretation</th></tr></thead><tbody><tr><td>ssdeep similarity</td><td>{metrics.fuzzy?.ssdeepSimilarity?.toFixed(2) ?? 'Unavailable'}</td><td>Higher is closer (0–100)</td></tr><tr><td>TLSH distance</td><td>{metrics.fuzzy?.tlshDistance ?? metrics.fuzzy?.tlshError ?? 'Unavailable for this reference'}</td><td>Lower is closer</td></tr></tbody></table></div><p>Fuzzy matching thresholds require labeled calibration data; a single uploaded video cannot establish a reliable threshold.</p></>}
  </section>;
}
