import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || 'tmp/evaluation-run-1');
const output = path.resolve('public/evaluation-fixtures');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
if (!manifest.synthetic) throw new Error('Only generated synthetic media can be bundled automatically.');
fs.mkdirSync(output,{recursive:true});
for (const name of new Set([manifest.reference,...manifest.cases.map(row=>row.file)])) {
  if (path.basename(name)!==name) throw new Error('Invalid dataset filename');
  fs.copyFileSync(path.join(root,name),path.join(output,name));
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
const report = JSON.parse(fs.readFileSync(path.join(root,'results.json'),'utf8'));
const fuzzy = JSON.parse(fs.readFileSync(path.join(root,'fuzzy-results-js.json'),'utf8'));
report.fuzzyResults = fuzzy.results; report.fuzzyThresholds = fuzzy.thresholds;
report.reports = report.reports.map(({ pairs, ...row })=>row);
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report));
fs.mkdirSync('docs/evaluation',{recursive:true});
fs.copyFileSync(path.join(root,'results.csv'),'docs/evaluation/results.csv');
fs.writeFileSync('docs/evaluation/fuzzy-results.json',JSON.stringify(fuzzy,null,2));
const defaults = report.reports.filter(r=>r.method==='pHash'&&r.metric==='normalizedHamming'&&r.threshold===.1875);
const recommendations = [...new Set(report.groups.map(g=>g.key.split('/').slice(0,2).join('/')))].map(key=>report.groups.filter(g=>g.key.startsWith(key+'/')).sort((a,b)=>b.f1-a.f1||Number(a.key.split('/').at(-1))-Number(b.key.split('/').at(-1)))[0]);
const md = `# Synthetic evaluation results\n\nMeasured on ${report.generatedAt}. These are 12-second FFmpeg test patterns, not real trips. ${manifest.cases.length} video cases, ${report.reports.length} method/threshold measurements, ${report.network.length} fault-injection scenarios.\n\n## Default pHash / normalized Hamming / threshold 0.1875\n\n| Scenario | Result | Score | Matched | Classification |\n|---|---|---:|---:|---|\n${defaults.map(r=>`| ${r.scenario} | ${r.status} | ${r.score.toFixed(2)} | ${r.matchedFingerprints}/${r.totalFingerprints} | ${r.classification} |`).join('\n')}\n\n## Candidate thresholds on this synthetic dataset only\n\nMax F1; ties use the smallest distance threshold. These are exploratory fits to this dataset, not held-out accuracy or universal thresholds. There is only one negative trip, so zero false positives does not demonstrate a safe false-positive rate.\n\n| Method / metric / threshold | TP | FP | TN | FN | F1 |\n|---|---:|---:|---:|---:|---:|\n${recommendations.map(r=>`| ${r.key} | ${r.tp} | ${r.fp} | ${r.tn} | ${r.fn} | ${r.f1.toFixed(3)} |`).join('\n')}\n\n## Fuzzy byte-stream results\n\n| Scenario | ssdeep similarity | TLSH distance |\n|---|---:|---:|\n${fuzzy.results.map(r=>`| ${r.scenario} | ${r.ssdeepSimilarity} | ${r.tlshDistance ?? 'unavailable'} |`).join('\n')}\n\nThe authentic file matches exactly; every re-encoded variant has ssdeep similarity 0. TLSH distances overlap between unrelated and transformed videos. Neither is a suitable stand-alone visual matcher. JavaScript ports were used (ssdeep.js digest with ssdeep comparison rules; tlsh 1.0.8 legacy format), not a claim of exhaustive compatibility with current native releases.\n\n## Network recovery\n\n${report.network.map(r=>`- ${r.scenario}: ${r.received}/${r.generated} received; ${r.lost} lost; ${r.pending} pending; ${r.duplicates} idempotent duplicates; ${r.passed?'PASS':'FAIL'}.`).join('\n')}\n\nThese use the production drain algorithm with fault-injected memory transport. Separate automated tests exercise persistent IndexedDB with fake-indexeddb. No live server was deliberately taken offline.\n\n## Failure analysis\n\nDefault pHash misses the speed changes, reverse-order video, overlay and crop. Cosine performs better on these test patterns but can accept reordered scenes because the coarse spatial appearance remains similar. Reported anomalies should be reviewed even when content matches. The low-frequency Haar wHash variant is mathematically equivalent to block-average aHash here and should not be interpreted as independent evidence.\n\nSampling at 2 FPS cannot locate every individual deleted or duplicated frame. Use higher-density fingerprints and a larger dataset of independent, visually similar real trips for a defensible threshold. Partial replacement is an anomaly classification separate from content correspondence. Exact SHA-256 still rejects every byte-changing transformation.\n`;
fs.writeFileSync('docs/evaluation/RESULTS.md',md);
console.log(`Published ${manifest.cases.length} synthetic cases and report to ${output}`);
