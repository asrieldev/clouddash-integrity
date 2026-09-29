const SHA256 = /^[a-fA-F0-9]{64}$/;

export function parseFingerprintFile(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const fingerprints = [];
  const invalidLines = [];
  lines.forEach((line, index) => {
    const value = line.trim();
    if (!value) return;
    if (!SHA256.test(value)) invalidLines.push(index + 1);
    else fingerprints.push(value.toLowerCase());
  });
  return { fingerprints, invalidLines };
}
