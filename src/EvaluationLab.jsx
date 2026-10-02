import { recommendThresholds } from './matching/recommendations.js';
import { useState } from 'react';
import { extractVideoFingerprints } from './matching/video.js';
import { classifyResult } from './matching/alignment.js';
import { METHODS, METRICS, DEFAULT_THRESHOLDS } from './matching/metrics.js';
import { SCENARIOS, exportData } from './matching/scenarios.js';
import { listFingerprints } from './fingerprintRepository.js';
import { verifyTrustedFingerprint } from './security/verification.js';
import { sha256 } from './security/chain.js';
import { supabase } from './supabase.js';
import { recordVerification } from './verificationHistory.js';
import { evaluateRecovery } from './matching/networkEvaluation.js';
import { compareFuzzy, fuzzyThresholds } from './matching/fuzzy.js';
import { matchReferences } from './matching/workerClient.js';

export default function EvaluationLab({ notify, localOnly = false }) {
  const [references, setReferences] = useState([]), [files, setFiles] = useState([]), [scenario, setScenario] = useState('authentic');
  const [method, setMethod] = useState('pHash'), [metric, setMetric] = useState('normalizedHamming'), [threshold, setThreshold] = useState(DEFAULT_THRESHOLDS.normalizedHamming);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [reports, setReports] = useState([]), [network, setNetwork] = useState([]);
  const [compareAll, setCompareAll] = useState(true), [sweep, setSweep] = useState(true), [manifest, setManifest] = useState(null);
  const [samplePreview, setSamplePreview] = useState('reference');
  async function loadSamples() {
    setBusy(true); setProgress('Loading generated test videos…');
    try {
      const response = await fetch('/evaluation-fixtures/manifest.json'); if (!response.ok) throw new Error('Sample dataset unavailable. Run the fixture publishing script.');
      const dataset = await response.json();
      const fetchFile = async name => { const response = await fetch(`/evaluation-fixtures/${name}`); if (!response.ok) throw new Error(`Cannot load ${name}`); return new File([await response.blob()],name,{type:'video/mp4'}); };
      const original = await fetchFile(dataset.reference);
      const profile = await extractVideoFingerprints(original);
      const selected = await Promise.all(dataset.cases.map(row=>fetchFile(row.file)));
      setReferences([{id:original.name,name:original.name,profile,hash:await sha256(await original.arrayBuffer()),trust:'SYNTHETIC_BENCHMARK_REFERENCE'}]);
      setFiles(selected); setManifest(dataset); notify(`Loaded ${selected.length} synthetic scenarios. Choose metrics and click Run evaluation.`);
    } catch(error) { notify(error.message); } finally { setBusy(false); setProgress(''); }
  }
  async function addReferences(selected) {
    setBusy(true);
    try {
      const added = [];
      for (const file of selected) {
        setProgress(`Extracting reference ${file.name}`);
        const profile = await extractVideoFingerprints(file);
        added.push({ id: file.name, name: file.name, profile, hash: await sha256(await file.arrayBuffer()), trust: 'LOCAL_BENCHMARK_REFERENCE' });
      }
      setReferences(old => [...old, ...added]);
    } catch (error) { notify(error.message); } finally { setBusy(false); setProgress(''); }
  }
  async function loadCloud() {
    if (localOnly) return;
    setBusy(true);
    try {
      const { data: workspace, error } = await supabase.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' });
      if (error) throw error;
      const records = await listFingerprints(workspace), accepted = [];
      for (const record of records) {
        if (!record.perceptual?.frames?.length) continue;
        const check = await verifyTrustedFingerprint(record, records);
        if (check.valid) accepted.push({ id: record.segment_id, name: `${record.session_id} / #${record.sequence}`, trip: record.session_id, sequence: record.sequence, profile: record.perceptual, hash: record.sha256, trust: 'SIGNED_CLOUD_REFERENCE' });
      }
      // Include complete contiguous trip timelines for clips spanning segment boundaries.
      const trips = new Map();
      for (const ref of accepted) { if (!trips.has(ref.trip)) trips.set(ref.trip, []); trips.get(ref.trip).push(ref); }
      const timelines = [];
      for (const [trip, refs] of trips) {
        refs.sort((a,b) => a.sequence - b.sequence);
        if (refs.length < 2 || refs.some((ref, i) => i && ref.sequence !== refs[i - 1].sequence + 1)) continue;
        let duration = 0; const frames = [];
        for (const ref of refs) { frames.push(...ref.profile.frames.map(frame => ({ ...frame, time: frame.time + duration }))); duration += ref.profile.duration; }
        if (frames.length <= 2400) timelines.push({ id: trip, name: `Trip ${trip}`, trip, trust: 'SIGNED_CLOUD_REFERENCE', profile: { frames, duration, interval: refs[0].profile.interval } });
      }
      setReferences([...accepted, ...timelines]);
      notify(`${accepted.length} signed segment profiles and ${timelines.length} trip timelines loaded. Older recordings need an original reference video.`);
    } catch (error) { notify(`Cloud references unavailable: ${error.message}`); } finally { setBusy(false); }
  }
  async function run() {
    setBusy(true); const results = [];
    try {
      for (const file of files) {
        const started = performance.now();
        const label = manifest?.cases?.find(item => item.file === file.name);
        const caseInfo = SCENARIOS.find(s => s.id === (label?.scenario || scenario));
        if (!caseInfo) throw new Error(`Unknown scenario for ${file.name}`);
        setProgress(`Decoding ${file.name}`);
        let profile;
        try { profile = await extractVideoFingerprints(file, { onProgress: (n, total) => setProgress(`${file.name}: ${n}/${total} samples`) }); }
        catch (error) { results.push({ name: file.name, scenario: caseInfo.id, status: 'UNSUPPORTED_OR_DECODE_ERROR', reason: error.message, processingMs: performance.now() - started }); continue; }
        const observedHash = await sha256(await file.arrayBuffer());
        const configurations = compareAll ? [...METHODS.flatMap(m => ['hamming', 'normalizedHamming'].map(metric => ({ method: m, metric }))), ...['l1','l2','cosine'].map(metric => ({ method: 'pHash', metric }))] : [{ method, metric }];
        for (const config of configurations) {
          const base = compareAll ? DEFAULT_THRESHOLDS[config.metric] : Number(threshold);
          const thresholds = sweep ? [0.5, 0.75, 1, 1.25, 1.5].map(scale => base * scale) : [base];
          for (const value of thresholds) {
            setProgress(`Matching ${file.name}: ${config.method} / ${config.metric} / ${value}`);
            const matches = await matchReferences(profile, references.map(ref => ref.profile), { ...config, threshold: value });
            const candidates = matches.map((match, index) => ({ ...match, reference: references[index] }));
            candidates.sort((a,b) => Number(b.match) - Number(a.match) || b.score - a.score);
            const best = candidates[0], { reference, ...match } = best;
            const identityCorrect = !label?.reference || label.reference === reference.id || label.reference === reference.name;
            const expected = label?.expected ?? caseInfo.expected;
            const classification = best.match && expected && !identityCorrect ? 'FALSE_MATCH' : classifyResult(best, expected, caseInfo.id === 'partial');
            const fuzzy = reference.profile.fuzzy && profile.fuzzy ? compareFuzzy(reference.profile.fuzzy, profile.fuzzy) : null;
            results.push({ ...match, fuzzy, name: file.name, scenario: caseInfo.id, expected, expectedReference: label?.reference ?? null, classification, referenceId: reference.id, referenceName: reference.name, trip: reference.trip ?? reference.id, referenceTrust: reference.trust, exactBytes: observedHash === reference.hash, integrityStatus: observedHash === reference.hash && reference.trust === 'SIGNED_CLOUD_REFERENCE' ? 'VERIFIED' : 'NOT_EXACTLY_VERIFIED', extractionMs: profile.extractionMs, totalProcessingMs: performance.now() - started, thresholdSource: 'EXPERIMENTAL_UNCALIBRATED', candidates: candidates.map(c => ({ id: c.reference.id, score: c.score, match: c.match })) });
          }
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      setReports(old => [...old, ...results]);
      if (!localOnly) await recordVerification('evaluation', { name: 'Video evaluation batch', status: 'EVALUATED', cases: results.length, failures: results.filter(r => ['MISSED_MATCH','FALSE_MATCH'].includes(r.classification)).length });
    } catch (error) { if (results.length) setReports(old => [...old, ...results]); notify(`Evaluation: ${error.message}`); } finally { setBusy(false); setProgress(''); }
  }
  const groups = Object.values(reports.filter(r => r.classification).reduce((acc, r) => {
    const key = `${r.method}/${r.metric}/${r.threshold}`;
    const g = acc[key] ||= { key, method: r.method, metric: r.metric, threshold: r.threshold, tp: 0, fp: 0, tn: 0, fn: 0, modifications: 0 };
    if (r.expected) { if (r.match && r.classification !== 'FALSE_MATCH') g.tp++; else g.fn++; } else { if (r.match) g.fp++; else g.tn++; }
    if (r.expected && r.classification === 'FALSE_MATCH') g.fp++;
    if (r.classification === 'CORRECTLY_DETECTED_MODIFICATION') g.modifications++;
    return acc;
  }, {}));
  const tested = new Set(reports.map(r => r.scenario));
  const fuzzyRows = [...new Map(reports.filter(r => r.fuzzy).map(r => [`${r.name}/${r.referenceId}`, { name: r.name, expected: r.expected, ...r.fuzzy }])).values()];
  const recommendations = recommendThresholds([...groups, ...fuzzyThresholds(fuzzyRows)]);
  return <div className="page evaluation-page">
    <div className="section-head"><div><h1>Video evaluation lab</h1><p>Choose an original, add copies to test, then compare their fingerprints.</p></div></div>

    <div className="evaluation-setup"><section className="panel"><span className="step-label">STEP 1</span><h2>Choose originals</h2><p>Add the recordings you want to compare against.</p>
      <div className="section-actions"><label className="button secondary">Choose original videos<input aria-label="Reference videos" type="file" accept="video/*" multiple disabled={busy} onChange={e => addReferences([...e.target.files])} /></label><button className="button secondary" disabled={busy || !supabase || localOnly} onClick={loadCloud}>Use recorder references</button><button className="button secondary" disabled={busy} onClick={() => setReferences([])}>Clear references</button></div>
      <p>{references.length} original{references.length === 1 ? '' : 's'} ready</p><ul className="evaluation-file-list">{references.map((r,i) => <li key={`${r.id}-${i}`}>{r.name} · {r.profile.frames.length} fingerprints · {r.trust}</li>)}</ul>
    </section>
    <section className="panel"><span className="step-label">STEP 2</span><h2>Add test videos</h2><p>Choose edited copies or unrelated videos, then label the expected scenario.</p><div className="evaluation-controls">
      <label>Test videos<input aria-label="Test videos" type="file" accept="video/*" multiple disabled={busy} onChange={e => { setFiles([...e.target.files]); setManifest(null); }} /></label>
      <label>Scenario<select value={scenario} disabled={busy} onChange={e => setScenario(e.target.value)}>{SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
    </div><p>{files.length} test video{files.length === 1 ? '' : 's'} selected{manifest ? ' · dataset labels loaded' : ''}</p><ul className="evaluation-file-list">{files.map((file,i) => <li key={i}>{file.name}</li>)}</ul></section></div>
    <section className="panel evaluation-run"><div><span className="step-label">STEP 3</span><h2>Run evaluation</h2><p>All fingerprint metrics and threshold comparisons are enabled by default.</p></div><button className="button primary" onClick={run} disabled={busy || !files.length || !references.length}>{busy ? 'Processing…' : 'Run evaluation'}</button><p role="status">{progress || (!references.length || !files.length ? 'Add originals and test videos to begin.' : 'Ready to compare.')}</p>
    <details className="evaluation-advanced"><summary>Advanced settings</summary><div className="evaluation-controls">      <label>Optional dataset manifest<input aria-label="Dataset manifest" type="file" accept=".json" disabled={busy} onChange={async e => { try { setManifest(JSON.parse(await e.target.files[0].text())); } catch { notify('Invalid dataset JSON'); } }} /></label>
      <label>Hash method<select value={method} disabled={busy} onChange={e => setMethod(e.target.value)}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
      <label>Distance metric<select value={metric} disabled={busy} onChange={e => { setMetric(e.target.value); setThreshold(DEFAULT_THRESHOLDS[e.target.value]); }}>{METRICS.map(m => <option key={m}>{m}</option>)}</select></label>
      <label>Maximum distance<input type="number" min="0" step="0.01" value={threshold} disabled={busy} onChange={e => setThreshold(e.target.value)} /></label>
</div><div className="section-actions"><label><input type="checkbox" checked={compareAll} disabled={busy} onChange={e => setCompareAll(e.target.checked)} /> Compare all metrics</label><label><input type="checkbox" checked={sweep} disabled={busy} onChange={e => setSweep(e.target.checked)} /> Compare thresholds (0.5–1.5×)</label></div><p>Single-method settings apply when Compare all metrics is off. Samples are taken every 0.5 seconds; query limit 10 minutes, reference timeline limit 20 minutes. Thresholds are experimental. Matching requires three informative frames and 70% coverage. Local originals do not establish capture authenticity.</p></details></section>
    <details className="panel sample-dataset"><summary>Try a demo · 23 sample scenarios</summary><p>23 reproducible transformations of synthetic test patterns. Preview or download them here, or load the full dataset for evaluation. These are not real dashcam recordings.</p><div className="section-actions"><select aria-label="Sample video preview" value={samplePreview} onChange={e=>setSamplePreview(e.target.value)}><option value="reference">Original reference</option>{SCENARIOS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select><a className="button secondary" href={`/evaluation-fixtures/${samplePreview}.mp4`} download>Download selected video</a><button className="button primary" disabled={busy} onClick={loadSamples}>Load all 23 test scenarios</button><a className="button secondary" href="/evaluation-fixtures/results.json" download>Download measured benchmark</a></div><video key={samplePreview} controls preload="metadata" src={`/evaluation-fixtures/${samplePreview}.mp4`} aria-label="Synthetic sample preview" /></details>
    {reports.length > 0 && <>
    <section className="panel"><div className="panel-title"><h2>Evaluation results</h2><div className="section-actions"><button className="button secondary" onClick={() => exportData({ schema: 'clouddash-evaluation-v2', reports, groups, recommendations, network, fuzzyThresholds: fuzzyThresholds(fuzzyRows), limitations: ['2 FPS sampling cannot detect every deleted frame', 'Similarity is not authenticity', 'Experimental thresholds', 'Haar approximation wHash can equal aHash', 'Fuzzy JavaScript ports; optional native cross-check available'] }, 'evaluation-results.json')}>Export report</button><button className="button secondary" disabled={busy} onClick={() => setReports([])}>Clear results</button></div></div>
      <div className="evaluation-summary"><div><strong>{new Set(reports.map(r => r.name)).size}</strong><span>Video filenames tested</span></div><div><strong>{reports.filter(r => r.classification === 'TRUE_MATCH').length}</strong><span>Correct match decisions</span></div><div><strong>{reports.filter(r => r.classification === 'FALSE_MATCH').length}</strong><span>False match decisions</span></div><div><strong>{reports.filter(r => r.classification === 'MISSED_MATCH').length}</strong><span>Missed match decisions</span></div></div><p>Decision counts include every tested metric and threshold; they are not counts of unique videos. {reports.filter(r => r.reason && !r.classification).length} decoding errors.</p>
      <details><summary>Detailed video measurements ({reports.length})</summary>
      <div className="table-wrap"><table><thead><tr><th>File / scenario</th><th>Result / classification</th><th>Metric / threshold</th><th>Measured distance</th><th>Trip / position</th><th>Score / matched</th><th>Time</th><th>Anomalies</th></tr></thead><tbody>{reports.map((r,i) => <tr key={i}><td>{r.name}<small>{r.scenario}</small></td><td>{r.status}<small>{r.classification || r.reason}</small><small>{r.integrityStatus}</small></td><td>{['l1','l2','cosine'].includes(r.metric) ? 'Luminance vector' : r.method} / {r.metric}<small>{r.threshold}</small></td><td>{r.meanDistance == null ? 'No aligned samples' : r.meanDistance.toFixed(4)}<small>Mean over accepted aligned frames</small>{r.metric === 'cosine' && r.meanDistance != null && <small>Cosine similarity: {(1-r.meanDistance).toFixed(4)}</small>}<details><summary>Frame distances</summary>{r.pairs?.map((p,i) => <small key={i}>{p.queryTime.toFixed(2)}s → {p.referenceTime.toFixed(2)}s: {p.distance.toFixed(4)}</small>)}</details></td><td>{r.referenceName || '—'}<small>{r.referenceStart?.toFixed(2)}–{r.referenceEnd?.toFixed(2)} s · offset {r.offsetSeconds?.toFixed(2)} · speed {r.speedRatio?.toFixed(2)}×</small></td><td>{r.score?.toFixed(1) ?? '—'} / 100<small>{r.matchedFingerprints}/{r.totalFingerprints} ({r.matchedPercentage?.toFixed(1)}%)</small></td><td>{(r.totalProcessingMs ?? r.processingMs)?.toFixed(0)} ms<small>matching {r.processingMs?.toFixed(0)} ms</small></td><td>{r.anomalies?.map(a => `${a.type}${a.start !== undefined ? ` @ ${a.start.toFixed(1)}s` : ''}`).join('; ') || 'None reported'}</td></tr>)}</tbody></table></div>
      </details><details><summary>Matching thresholds & accuracy</summary>
      <h3>Suggested matching thresholds</h3><p>Best F1 among tested thresholds, with fewer false matches used to break ties. Suggestions require both positive and negative examples and apply only to this dataset. Validate on separate trips before adopting them. Hamming uses 64 bits; normalized Hamming divides by 64. Vector distances use a normalized 8×8 luminance vector, independently of the hash method. wHash is a Haar approximation and can equal aHash.</p><div className="table-wrap"><table><thead><tr><th>Fingerprint / metric</th><th>Suggested threshold</th><th>F1</th><th>Validation</th></tr></thead><tbody>{recommendations.map(r => <tr key={r.key}><td>{r.key}</td><td>{r.threshold == null ? '—' : `${r.metric === 'ssdeepSimilarity' ? '≥' : '≤'} ${r.threshold}`}</td><td>{r.f1?.toFixed(3) ?? '—'}</td><td>{r.status}</td></tr>)}</tbody></table></div>
      <h3>Threshold comparison</h3><div className="table-wrap"><table><thead><tr><th>Method / metric / threshold</th><th>TP / FP / TN / FN</th><th>Precision</th><th>Recall</th><th>F1</th><th>Detected modifications</th></tr></thead><tbody>{groups.map(g => <tr key={g.key}><td>{g.key}</td><td>{g.tp} / {g.fp} / {g.tn} / {g.fn}</td><td>{g.tp + g.fp ? (g.tp / (g.tp + g.fp)).toFixed(3) : 'N/A'}</td><td>{g.tp + g.fn ? (g.tp / (g.tp + g.fn)).toFixed(3) : 'N/A'}</td><td>{2*g.tp+g.fp+g.fn ? (2*g.tp/(2*g.tp+g.fp+g.fn)).toFixed(3) : 'N/A'}</td><td>{g.modifications}</td></tr>)}</tbody></table></div>
    </details></section>
    </>}
    <details className="panel"><summary>Network recovery tests</summary><h2>Network recovery tests</h2><p>Fault injection exercises the production outbox drain algorithm against an in-memory server. This measures retry and duplicate behavior; it does not claim a live Internet outage test.</p><button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); try { setNetwork(await evaluateRecovery()); } finally { setBusy(false); } }}>Run failure scenarios</button><div className="table-wrap"><table><thead><tr><th>Scenario</th><th>Generated / received</th><th>Lost / pending</th><th>Duplicates</th><th>Recovery</th><th>Time</th></tr></thead><tbody>{network.map(r => <tr key={r.scenario}><td>{r.scenario}</td><td>{r.generated} / {r.received}</td><td>{r.lost} / {r.pending}</td><td>{r.duplicates}</td><td>{r.passed ? 'PASS' : 'FAIL'}</td><td>{r.processingMs.toFixed(1)} ms</td></tr>)}</tbody></table></div></details>
    {fuzzyRows.length > 0 && <details className="panel"><summary>Fuzzy hash results</summary><p>Experimental JavaScript ports: ssdeep similarity (higher is closer), TLSH distance (lower is closer). Byte-stream similarity is not visual similarity. Trip timelines have no single source byte stream. Native cross-check: scripts/fuzzy-metrics.py.</p><div className="table-wrap"><table><thead><tr><th>File</th><th>ssdeep similarity</th><th>TLSH distance</th></tr></thead><tbody>{fuzzyRows.map((r,i) => <tr key={i}><td>{r.name}</td><td>{r.ssdeepSimilarity?.toFixed(2)}</td><td>{r.tlshDistance ?? r.tlshError ?? 'Unavailable'}</td></tr>)}</tbody></table></div><h3>Fuzzy thresholds</h3><div className="table-wrap"><table><thead><tr><th>Metric / threshold</th><th>TP / FP / TN / FN</th><th>F1</th></tr></thead><tbody>{fuzzyThresholds(fuzzyRows).map(r => <tr key={`${r.metric}-${r.threshold}`}><td>{r.metric} / {r.threshold}</td><td>{r.tp} / {r.fp} / {r.tn} / {r.fn}</td><td>{r.f1.toFixed(3)}</td></tr>)}</tbody></table></div></details>}
    <details className="panel"><summary>Scenario coverage & limitations</summary><div className="scenario-grid">{SCENARIOS.map(s => <span className={`badge ${tested.has(s.id) ? 'info' : 'neutral'}`} key={s.id}>{s.label}: {tested.has(s.id) ? 'evaluated' : 'not evaluated'}</span>)}</div><p>Cropping, large overlays, repeated scenery, short clips and replacement footage can cause false or missed matches. Anomalies are candidate inconsistencies, not an identification of the visual edit.</p></details>
  </div>;
}
