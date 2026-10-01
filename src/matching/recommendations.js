// Recommendations describe this dataset only, never held-out accuracy.
export function recommendThresholds(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.method || 'file bytes'}/${row.metric}`;
    const list = groups.get(key) || [];
    list.push(row); groups.set(key, list);
  }
  return [...groups].map(([key, candidates]) => {
    const eligible = candidates.filter(r => r.tp + r.fn > 0 && r.tn + r.fp > 0);
    const f1 = r => 2*r.tp / (2*r.tp + r.fp + r.fn || 1);
    eligible.sort((a,b) => f1(b)-f1(a) || a.fp-b.fp || (a.metric === 'ssdeepSimilarity' ? b.threshold-a.threshold : a.threshold-b.threshold));
    const best = eligible[0];
    return best ? { ...best, key, f1: f1(best), status: 'Provisional: validate on held-out trips' } : { key, status: 'Add both matching and non-matching labeled videos' };
  });
}
