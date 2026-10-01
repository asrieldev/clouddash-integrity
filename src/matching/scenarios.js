export const SCENARIOS = [
  ['authentic', 'Authentic / exact original', true], ['trim-start', 'Trimmed beginning', true], ['trim-end', 'Trimmed end', true], ['extract', 'Extract from longer trip', true], ['shift', 'Shifted timeline', true], ['slow', 'Slower playback', true], ['fast', 'Faster playback', true], ['fps', 'Different frame rate', true], ['missing', 'Missing frames', true], ['duplicate', 'Duplicated frames', true], ['reorder', 'Reordered frames', true], ['hevc', 'H.264 to H.265 / HEVC', true], ['bitrate', 'Different bitrate', true], ['resolution', 'Different resolution', true], ['compression', 'Compression / quality', true], ['brightness', 'Brightness', true], ['contrast', 'Contrast', true], ['salt-pepper', 'Salt-and-pepper noise', true], ['noise', 'Moderate image noise', true], ['overlay', 'Logo / watermark / overlay', true], ['crop', 'Cropped image', true], ['other-trip', 'Another trip', false], ['partial', 'Partially replaced footage', true]
].map(([id, label, expected]) => ({ id, label, expected }));

export function exportData(value, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
