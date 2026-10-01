export const METHODS = ['aHash', 'dHash', 'pHash', 'wHash'];
export const METRICS = ['hamming', 'normalizedHamming', 'l1', 'l2', 'cosine'];
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const bits = a => { const m = mean(a); return a.map(x => x > m ? '1' : '0').join(''); };
const COS = Array.from({ length: 8 }, (_, u) => Array.from({ length: 32 }, (_, x) => Math.cos((2 * x + 1) * u * Math.PI / 64)));

// Input is a 32 x 32 luminance plane in [0,255]. All hashes have 64 bits.
export function fingerprintFrame(pixels) {
  if (pixels.length !== 1024 || !Array.from(pixels).every(Number.isFinite)) throw new Error('Expected 32x32 finite luminance samples');
  const down = (w, h) => Array.from({ length: w * h }, (_, i) => {
    const x0 = Math.floor(i % w * 32 / w), x1 = Math.floor((i % w + 1) * 32 / w);
    const y0 = Math.floor(Math.floor(i / w) * 32 / h), y1 = Math.floor((Math.floor(i / w) + 1) * 32 / h);
    let sum = 0, count = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += pixels[y * 32 + x]; count++; }
    return sum / count;
  });
  const small = down(8, 8), gradient = down(9, 8);
  const dHash = Array.from({ length: 64 }, (_, i) => gradient[Math.floor(i / 8) * 9 + i % 8] > gradient[Math.floor(i / 8) * 9 + i % 8 + 1] ? '1' : '0').join('');
  const coefficients = [];
  const horizontal = Array.from({ length: 32 }, (_, y) => COS.map(row => row.reduce((sum, c, x) => sum + pixels[y * 32 + x] * c, 0)));
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    let sum = 0;
    for (let y = 0; y < 32; y++) sum += horizontal[y][u] * COS[v][y];
    coefficients.push(sum);
  }
  const median = coefficients.slice(1).sort((a, b) => a - b)[31];
  // Two-level Haar low-frequency approximation. Explicit Haar transform rather than a library-specific wHash variant.
  let wave = Array.from(pixels), size = 32;
  while (size > 8) {
    const next = [];
    for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) next.push((wave[y * size + x] + wave[y * size + x + 1] + wave[(y + 1) * size + x] + wave[(y + 1) * size + x + 1]) / 4);
    wave = next; size /= 2;
  }
  const center = mean(small), scale = Math.sqrt(mean(small.map(x => (x - center) ** 2)));
  return { aHash: bits(small), dHash, pHash: coefficients.map((x, i) => i && x > median ? '1' : '0').join(''), wHash: bits(wave), vector: small.map(x => scale > 1 ? (x - center) / scale : 0), information: scale };
}

export function distance(a, b, method = 'pHash', metric = 'normalizedHamming') {
  if (!METHODS.includes(method) || !METRICS.includes(metric)) throw new Error('Unknown method or metric');
  if (metric === 'hamming' || metric === 'normalizedHamming') {
    const x = a[method], y = b[method];
    if (!/^[01]{64}$/.test(x) || !/^[01]{64}$/.test(y)) throw new Error('Invalid 64-bit perceptual hash');
    let n = 0; for (let i = 0; i < 64; i++) if (x[i] !== y[i]) n++;
    return metric === 'hamming' ? n : n / 64;
  }
  const x = a.vector, y = b.vector;
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== 64 || y.length !== 64 || ![...x, ...y].every(Number.isFinite)) throw new Error('Invalid fingerprint vector');
  if (metric === 'l1') return x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0);
  if (metric === 'l2') return Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0));
  const norm = Math.sqrt(x.reduce((s, v) => s + v * v, 0) * y.reduce((s, v) => s + v * v, 0));
  return norm < 1e-9 ? 1 : Math.max(0, Math.min(2, 1 - x.reduce((s, v, i) => s + v * y[i], 0) / norm));
}

export const DEFAULT_THRESHOLDS = { hamming: 12, normalizedHamming: 12 / 64, l1: 32, l2: 5, cosine: 0.2 };

export function thresholdSweep(samples, thresholds) {
  return thresholds.map(threshold => {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const sample of samples) {
      const match = sample.distance <= threshold;
      if (sample.expected) match ? tp++ : fn++; else match ? fp++ : tn++;
    }
    return { threshold, tp, fp, tn, fn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, falsePositiveRate: fp + tn ? fp / (fp + tn) : null, f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : 0 };
  });
}
