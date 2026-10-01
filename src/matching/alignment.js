import { distance, DEFAULT_THRESHOLDS } from './metrics.js';

// Local sequence alignment: gaps absorb deleted/duplicated samples without requiring equal FPS.
export function matchVideo(query, reference, { method = 'pHash', metric = 'normalizedHamming', threshold = DEFAULT_THRESHOLDS[metric], minimumCoverage = 0.7 } = {}) {
  const started = performance.now(), q = query.frames, r = reference.frames;
  if (!q?.length || !r?.length || q.length > 1200 || r.length > 2400) throw new Error('Empty or oversized fingerprint sequence');
  if (!Number.isFinite(threshold) || threshold < 0 || minimumCoverage <= 0 || minimumCoverage > 1) throw new Error('Invalid matching threshold or coverage');
  const width = r.length + 1, trace = new Uint8Array((q.length + 1) * width);
  let previous = new Float64Array(width), best = 0, endI = 0, endJ = 0;
  for (let i = 1; i <= q.length; i++) {
    const row = new Float64Array(width);
    for (let j = 1; j <= r.length; j++) {
      const d = distance(q[i - 1], r[j - 1], method, metric);
      const informative = q[i - 1].information >= 3 && r[j - 1].information >= 3;
      const diagonal = previous[j - 1] + (informative && d <= threshold ? 1 - 0.4 * d / Math.max(threshold, 1e-9) : -0.8);
      const up = previous[j] - 0.35, left = row[j - 1] - 0.35;
      row[j] = Math.max(0, diagonal, up, left);
      trace[i * width + j] = row[j] === 0 ? 0 : row[j] === diagonal ? 1 : row[j] === up ? 2 : 3;
      if (row[j] > best) { best = row[j]; endI = i; endJ = j; }
    }
    previous = row;
  }
  const pairs = []; let i = endI, j = endJ;
  while (i > 0 && j > 0) {
    const step = trace[i * width + j];
    if (!step) break;
    if (step === 1) {
      const d = distance(q[i - 1], r[j - 1], method, metric);
      if (d <= threshold && q[i - 1].information >= 3 && r[j - 1].information >= 3) pairs.push({ queryIndex: i - 1, referenceIndex: j - 1, queryTime: q[i - 1].time, referenceTime: r[j - 1].time, distance: d });
      i--; j--;
    } else if (step === 2) i--; else j--;
  }
  pairs.reverse();
  const matched = new Set(pairs.map(p => p.queryIndex)), anomalies = [];
  let missingStart = null;
  for (let index = 0; index <= q.length; index++) {
    if (index < q.length && !matched.has(index)) { if (missingStart === null) missingStart = index; }
    else if (missingStart !== null) {
      anomalies.push({ type: 'UNMATCHED_SECTION', start: q[missingStart].time, end: index < q.length ? q[index].time : query.duration, samples: index - missingStart }); missingStart = null;
    }
  }
  for (let k = 1; k < pairs.length; k++) {
    const a = pairs[k - 1], b = pairs[k];
    if (b.referenceIndex - a.referenceIndex > b.queryIndex - a.queryIndex + 1) anomalies.push({ type: 'REFERENCE_GAP', start: a.referenceTime, end: b.referenceTime });
  }
  const first = pairs[0], last = pairs.at(-1);
  const speed = pairs.length > 1 && last.queryTime > first.queryTime ? (last.referenceTime - first.referenceTime) / (last.queryTime - first.queryTime) : null;
  if (speed !== null && Math.abs(speed - 1) > 0.06) anomalies.push({ type: 'TIME_SCALE_CHANGE', ratio: speed });
  // Non-monotonic nearest matches are evidence of possible reordering, not proof.
  let priorNearest = -1;
  for (let index = 0; index < q.length; index++) {
    if (q[index].information < 3) continue;
    let nearest = -1, nearestDistance = Infinity;
    for (let k = 0; k < r.length; k++) { const d = distance(q[index], r[k], method, metric); if (d < nearestDistance) { nearestDistance = d; nearest = k; } }
    if (nearestDistance <= threshold) {
      if (priorNearest >= 0 && nearest < priorNearest) anomalies.push({ type: 'POSSIBLE_REORDER', start: q[index].time });
      if (priorNearest === nearest && index > 0 && distance(q[index], q[index - 1], method, metric) === 0) anomalies.push({ type: 'POSSIBLE_DUPLICATE_OR_STATIC_SCENE', start: q[index].time });
      priorNearest = nearest;
    }
  }
  const coverage = pairs.length / q.length;
  const meanDistance = pairs.length ? pairs.reduce((sum, p) => sum + p.distance, 0) / pairs.length : null;
  const fullScale = { hamming: 64, normalizedHamming: 1, l1: 128, l2: 16, cosine: 2 }[metric];
  const match = pairs.length >= 3 && coverage >= minimumCoverage;
  return { match, status: match ? 'CONTENT_MATCH' : pairs.length >= 3 ? 'PARTIAL_MATCH' : 'NO_MATCH', matchedFingerprints: pairs.length, totalFingerprints: q.length, matchedPercentage: coverage * 100, score: meanDistance === null ? 0 : 100 * coverage * Math.max(0, 1 - meanDistance / fullScale), meanDistance, referenceStart: first?.referenceTime ?? null, referenceEnd: last ? Math.min(reference.duration, last.referenceTime + reference.interval) : null, queryStart: first?.queryTime ?? null, offsetSeconds: first ? first.referenceTime - (speed ?? 1) * first.queryTime : null, speedRatio: speed, anomalies, pairs, method, metric, threshold, minimumCoverage, processingMs: performance.now() - started };
}

export function classifyResult(result, expected, modified = false) {
  if (modified && result.anomalies.some(x => ['UNMATCHED_SECTION', 'REFERENCE_GAP', 'POSSIBLE_REORDER'].includes(x.type))) return 'CORRECTLY_DETECTED_MODIFICATION';
  return expected ? result.match ? 'TRUE_MATCH' : 'MISSED_MATCH' : result.match ? 'FALSE_MATCH' : 'TRUE_NEGATIVE';
}
