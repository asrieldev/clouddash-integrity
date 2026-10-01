import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fingerprintFrame, METHODS, DEFAULT_THRESHOLDS } from '../src/matching/metrics.js';
import { matchVideo, classifyResult } from '../src/matching/alignment.js';
import { SCENARIOS } from '../src/matching/scenarios.js';
import { evaluateRecovery } from '../src/matching/networkEvaluation.js';
import { fuzzyFingerprint, compareFuzzy, fuzzyThresholds } from '../src/matching/fuzzy.js';

// This command processes local media only. No uploads or database mutations.
const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
if (args.includes('--help')) {
  console.log('node scripts/evaluate-videos.mjs --out <new-directory> [--source original.mp4 --other other-trip.mp4] [--ffmpeg ffmpeg] [--sweep]\nWithout sources, generates explicitly synthetic fixtures. Output includes videos, manifest, JSON/CSV results and network recovery results.');
  process.exit(0);
}
let ffmpeg = option('--ffmpeg', process.env.FFMPEG || 'ffmpeg');
if (ffmpeg === 'ffmpeg') { try { ffmpeg = (await import('ffmpeg-static')).default; } catch {} }
const output = path.resolve(option('--out', 'tmp/video-evaluation'));
if (fs.existsSync(path.join(output, 'manifest.json'))) throw new Error('Choose a new output directory; an existing dataset will not be overwritten.');
fs.mkdirSync(output, { recursive: true });
function runFfmpeg(params, raw = false) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...params], { encoding: raw ? undefined : 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 180000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || String(result.stderr).slice(-1600));
  return result.stdout;
}
runFfmpeg(['-version']);
const sourceArg = option('--source', null), otherArg = option('--other', null);
if (Boolean(sourceArg) !== Boolean(otherArg)) throw new Error('Provide both --source and --other from different trips, or neither for synthetic fixtures.');
const original = path.join(output, 'reference.mp4'), other = path.join(output, 'other-reference.mp4');
const encode = ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p'];
if (sourceArg) {
  runFfmpeg(['-i', path.resolve(sourceArg), '-t', '12', ...encode, original]);
  runFfmpeg(['-i', path.resolve(otherArg), '-t', '12', '-vf', 'scale=320:240', ...encode, other]);
} else {
  runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=12', ...encode, original]);
  runFfmpeg(['-f', 'lavfi', '-i', 'mandelbrot=size=320x240:rate=15', '-t', '12', ...encode, other]);
}
const transformations = {
  'trim-start': 'trim=start=3,setpts=PTS-STARTPTS', 'trim-end': 'trim=end=9,setpts=PTS-STARTPTS', extract: 'trim=start=3:end=9,setpts=PTS-STARTPTS',
  shift: 'tpad=start_duration=3:start_mode=add', slow: 'setpts=1.1*PTS', fast: 'setpts=0.9*PTS', fps: 'fps=10', missing: "select=not(between(n\\,60\\,74)),setpts=N/(15*TB)",
  duplicate: 'fps=30', reorder: 'reverse', resolution: 'scale=160:120', brightness: 'eq=brightness=0.12', contrast: 'eq=contrast=1.2', noise: 'noise=alls=10:allf=t+u',
  'salt-pepper': "geq=lum='if(lt(random(1),0.015),0,if(gt(random(2),0.985),255,lum(X,Y)))':cb='cb(X,Y)':cr='cr(X,Y)'",
  overlay: 'drawbox=x=10:y=10:w=65:h=35:color=white:t=fill', crop: 'crop=iw*0.85:ih*0.85,scale=320:240'
};
const cases = [], errors = [];
for (const scenario of SCENARIOS) {
  const file = `${scenario.id}.mp4`, target = path.join(output, file);
  try {
    console.log(`Generating ${scenario.id}`);
    if (scenario.id === 'authentic') fs.copyFileSync(original, target);
    else if (scenario.id === 'other-trip') fs.copyFileSync(other, target);
    else if (scenario.id === 'hevc') runFfmpeg(['-i', original, '-an', '-c:v', 'libx265', '-preset', 'fast', '-x265-params', 'log-level=error', '-tag:v', 'hvc1', target]);
    else if (scenario.id === 'bitrate') runFfmpeg(['-i', original, '-an', '-c:v', 'libx264', '-b:v', '80k', target]);
    else if (scenario.id === 'compression') runFfmpeg(['-i', original, '-an', '-c:v', 'libx264', '-crf', '40', target]);
    else if (scenario.id === 'partial') runFfmpeg(['-i', original, '-i', other, '-filter_complex', '[0:v]split[a][b];[a]trim=end=4,setpts=PTS-STARTPTS,scale=320:240,setsar=1[x];[1:v]trim=start=4:end=7,setpts=PTS-STARTPTS,scale=320:240,setsar=1[y];[b]trim=start=7,setpts=PTS-STARTPTS,scale=320:240,setsar=1[z];[x][y][z]concat=n=3:v=1:a=0[out]', '-map', '[out]', ...encode, target]);
    else runFfmpeg(['-i', original, '-vf', transformations[scenario.id], ...encode, target]);
    cases.push({ file, scenario: scenario.id, expected: scenario.expected, reference: 'reference.mp4' });
  } catch (error) { errors.push({ scenario: scenario.id, status: 'GENERATION_ERROR', reason: error.message }); }
}
const manifest = { schema: 'clouddash-dataset-v1', synthetic: !sourceArg, reference: 'reference.mp4', description: sourceArg ? 'First 12 seconds of provided distinct trips; reference normalized to H.264.' : 'Synthetic FFmpeg test patterns; these are not real driving footage.', cases };
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
function extract(file) {
  const started = performance.now();
  const bytes = runFfmpeg(['-i', file, '-vf', 'fps=2,scale=32:32', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], true);
  const frames = [];
  for (let at = 0; at + 1024 <= bytes.length; at += 1024) frames.push({ time: frames.length / 2, ...fingerprintFrame(bytes.subarray(at, at + 1024)) });
  return { schema: 'clouddash-perceptual-v1', duration: frames.length / 2, interval: 0.5, frames, fuzzy: fuzzyFingerprint(fs.readFileSync(file)), extractionMs: performance.now() - started };
}
const reference = extract(original), reports = [...errors], fuzzyResults = [];
const configurations = [...METHODS.flatMap(method => ['hamming','normalizedHamming'].map(metric => ({ method, metric }))), ...['l1','l2','cosine'].map(metric => ({ method: 'pHash', metric }))];
for (const testCase of cases) {
  console.log(`Evaluating ${testCase.scenario}`);
  try {
    const query = extract(path.join(output, testCase.file));
    fuzzyResults.push({ ...testCase, ...compareFuzzy(reference.fuzzy, query.fuzzy) });
    for (const config of configurations) for (const scale of args.includes('--sweep') ? [0.5, 0.75, 1, 1.25, 1.5] : [1]) {
      const result = matchVideo(query, reference, { ...config, threshold: DEFAULT_THRESHOLDS[config.metric] * scale });
      reports.push({ ...testCase, ...result, classification: classifyResult(result, testCase.expected, testCase.scenario === 'partial'), extractionMs: query.extractionMs, totalProcessingMs: query.extractionMs + result.processingMs });
    }
  } catch (error) { reports.push({ ...testCase, status: 'DECODE_ERROR', reason: error.message }); }
}
const network = await evaluateRecovery();
const groups = Object.values(reports.filter(r => r.classification).reduce((all, r) => {
  const key = `${r.method}/${r.metric}/${r.threshold}`, g = all[key] ||= { key, tp: 0, fp: 0, tn: 0, fn: 0, detectedModifications: 0 };
  if (r.expected) r.match ? g.tp++ : g.fn++; else r.match ? g.fp++ : g.tn++;
  if (r.classification === 'CORRECTLY_DETECTED_MODIFICATION') g.detectedModifications++;
  return all;
}, {})).map(g => ({ ...g, precision: g.tp + g.fp ? g.tp/(g.tp+g.fp) : null, recall: g.tp + g.fn ? g.tp/(g.tp+g.fn) : null, f1: 2*g.tp+g.fp+g.fn ? 2*g.tp/(2*g.tp+g.fp+g.fn) : 0, falsePositiveRate: g.fp+g.tn ? g.fp/(g.fp+g.tn) : null }));
const report = { schema: 'clouddash-evaluation-v1', generatedAt: new Date().toISOString(), manifest, reports, groups, network, fuzzyResults, fuzzyThresholds: fuzzyThresholds(fuzzyResults), referenceExtractionMs: reference.extractionMs, limitations: ['Synthetic fixtures do not establish real-world accuracy.', 'Thresholds are exploratory; calibrate on independent trips.', '2 FPS misses sub-sample edits.', 'wHash is Haar low-frequency approximation.', 'Browser decoder/resizer may differ from FFmpeg.'] };
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
const columns = ['scenario','method','metric','threshold','status','classification','referenceStart','referenceEnd','score','matchedFingerprints','totalFingerprints','matchedPercentage','processingMs','extractionMs'];
fs.writeFileSync(path.join(output, 'results.csv'), [columns.join(','), ...reports.map(row => columns.map(key => JSON.stringify(row[key] ?? '')).join(','))].join('\n'));
console.log(JSON.stringify({ output, generated: cases.length, errors: errors.length, measurements: reports.length, networkPassed: network.every(r => r.passed) }));
