import fs from 'node:fs';
import path from 'node:path';
import { fuzzyFingerprint, compareFuzzy, fuzzyThresholds } from '../src/matching/fuzzy.js';
const manifestPath = path.resolve(process.argv[2]), root = path.dirname(manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const reference = fuzzyFingerprint(fs.readFileSync(path.join(root,manifest.reference)));
const results = manifest.cases.map(row => {
  const started = performance.now();
  return { ...row, ...compareFuzzy(reference,fuzzyFingerprint(fs.readFileSync(path.join(root,row.file)))), processingMs: performance.now()-started };
});
const output = { results, thresholds:fuzzyThresholds(results) };
fs.writeFileSync(path.join(root,'fuzzy-results-js.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify(output));
