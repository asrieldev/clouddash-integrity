"""Optional native fuzzy-hash experiment; pip install ssdeep py-tlsh.
Usage: python scripts/fuzzy-metrics.py path/to/dataset/manifest.json
Reports missing native dependencies as unavailable, never as a zero-distance match.
"""
import json
import pathlib
import sys
import time

manifest_path = pathlib.Path(sys.argv[1])
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
root = manifest_path.parent
reference = (root / manifest['reference']).read_bytes()
results = []
for module_name in ('ssdeep', 'tlsh'):
    try:
        module = __import__(module_name)
        reference_hash = module.hash(reference)
        if not reference_hash or reference_hash == 'TNULL':
            raise ValueError('Reference has insufficient length or entropy')
    except (ImportError, ValueError) as error:
        results.append({'metric': module_name, 'status': 'UNAVAILABLE', 'reason': str(error)})
        continue
    for case in manifest['cases']:
        start = time.perf_counter()
        try:
            candidate = module.hash((root / case['file']).read_bytes())
            if not candidate or candidate == 'TNULL':
                raise ValueError('Insufficient length or entropy')
            score = module.compare(reference_hash, candidate) if module_name == 'ssdeep' else module.diff(reference_hash, candidate)
            results.append({**case, 'metric': module_name, 'score': score, 'higherIsBetter': module_name == 'ssdeep', 'processingMs': (time.perf_counter() - start) * 1000})
        except Exception as error:
            results.append({**case, 'metric': module_name, 'status': 'ERROR', 'reason': str(error)})
sweeps = []
for metric, thresholds in [('ssdeep', [10, 25, 50, 75, 90, 100]), ('tlsh', [0, 25, 50, 100, 150, 200, 300])]:
    rows = [row for row in results if row['metric'] == metric and 'score' in row]
    for threshold in thresholds if rows else []:
        tp = fp = tn = fn = 0
        for row in rows:
            match = row['score'] >= threshold if metric == 'ssdeep' else row['score'] <= threshold
            if row['expected']:
                tp += int(match)
                fn += int(not match)
            else:
                fp += int(match)
                tn += int(not match)
        sweeps.append({'metric': metric, 'threshold': threshold, 'tp': tp, 'fp': fp, 'tn': tn, 'fn': fn})
output = {'note': 'Byte-level fuzzy similarity does not establish visual correspondence. Thresholds are exploratory.', 'results': results, 'thresholds': sweeps}
(root / 'fuzzy-results.json').write_text(json.dumps(output, indent=2), encoding='utf-8')
print(json.dumps(output, indent=2))
