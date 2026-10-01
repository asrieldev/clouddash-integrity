import { METHODS, DEFAULT_THRESHOLDS } from './metrics.js';
import { compareFuzzy } from './fuzzy.js';
import { matchReferences } from './workerClient.js';
import { extractVideoFingerprints } from './video.js';

export async function verifyVideoMetrics(blob, reference, trusted, { extract = extractVideoFingerprints, match = matchReferences } = {}) {
  if (!reference) return { reason: 'Select the original recorded segment or load its manifest to compare a renamed or edited video.', rows: [] };
  if (!trusted) return { reason: 'Reference signature or chain validation failed. Similarity cannot use an untrusted reference.', rows: [] };
  if (!reference.perceptual?.frames?.length) return { reason: 'This recording has no stored frame fingerprints. Record a new clip to enable these tests.', rows: [] };
  try {
    const query = await extract(blob);
    const configurations = [...METHODS.flatMap(method => ['hamming', 'normalizedHamming'].map(metric => ({ method, metric }))), ...['l1', 'l2', 'cosine'].map(metric => ({ method: 'pHash', metric }))];
    const rows = [];
    for (const config of configurations) {
      const [result] = await match(query, [reference.perceptual], { ...config, threshold: DEFAULT_THRESHOLDS[config.metric] });
      rows.push({ ...result, label: ['l1','l2','cosine'].includes(config.metric) ? 'Luminance vector' : config.method });
    }
    const fuzzy = reference.perceptual.fuzzy && query.fuzzy ? compareFuzzy(reference.perceptual.fuzzy, query.fuzzy) : null;
    return { rows, fuzzy, thresholdSource: 'EXPERIMENTAL_UNCALIBRATED' };
  } catch (error) { return { rows: [], reason: `Similarity tests unavailable: ${error.message}` }; }
}
