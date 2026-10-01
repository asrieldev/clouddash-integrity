import { fingerprintFrame } from './metrics.js';
import { fuzzyFingerprint } from './fuzzy.js';

function waitEvent(video, event, action) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Video decoding timed out; codec may be unsupported.')), 15000);
    const ready = () => finish();
    const failed = () => finish(new Error('Unsupported or damaged video. Try an H.264 MP4 or WebM.'));
    function finish(error) { clearTimeout(timer); video.removeEventListener(event, ready); video.removeEventListener('error', failed); error ? reject(error) : resolve(); }
    video.addEventListener(event, ready, { once: true }); video.addEventListener('error', failed, { once: true }); action();
  });
}

export async function extractVideoFingerprints(blob, { interval = 0.5, maxFrames = 1200, onProgress = () => {} } = {}) {
  if (blob.size > 128 * 1024 * 1024) throw new Error('Browser evaluation limit is 128 MiB per video. Use a shorter clip or the CLI.');
  const started = performance.now();
  const video = document.createElement('video'), url = URL.createObjectURL(blob);
  video.muted = true; video.preload = 'auto'; video.playsInline = true;
  try {
    await waitEvent(video, 'loadeddata', () => { video.src = url; });
    if (!Number.isFinite(video.duration)) {
      await waitEvent(video, 'seeked', () => { video.currentTime = 1e10; });
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Video duration is unavailable. Remux this recording before evaluation.');
    if (Math.ceil(duration / interval) > maxFrames) throw new Error(`Video exceeds ${maxFrames * interval} seconds at this sampling rate. Select a shorter section.`);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true }), frames = [];
    for (let t = 0; t < duration; t += interval) {
      const target = Math.min(t + 0.001, duration - 0.001);
      if (Math.abs(video.currentTime - target) > 0.0001) await waitEvent(video, 'seeked', () => { video.currentTime = Math.max(0, target); });
      context.drawImage(video, 0, 0, 32, 32);
      const rgba = context.getImageData(0, 0, 32, 32).data;
      const pixels = Array.from({ length: 1024 }, (_, i) => 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]);
      frames.push({ time: t, ...fingerprintFrame(pixels) });
      onProgress(frames.length, Math.ceil(duration / interval));
    }
    return { schema: 'clouddash-perceptual-v1', duration, interval, frames, fuzzy: fuzzyFingerprint(await blob.arrayBuffer()), extractionMs: performance.now() - started };
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
