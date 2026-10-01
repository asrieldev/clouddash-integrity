# Synthetic evaluation results

Measured on 2026-09-30T11:52:03.467Z. These are 12-second FFmpeg test patterns, not real trips. 23 video cases, 1265 method/threshold measurements, 8 fault-injection scenarios.

## Default pHash / normalized Hamming / threshold 0.1875

| Scenario | Result | Score | Matched | Classification |
|---|---|---:|---:|---|
| authentic | CONTENT_MATCH | 100.00 | 24/24 | TRUE_MATCH |
| trim-start | CONTENT_MATCH | 99.65 | 18/18 | TRUE_MATCH |
| trim-end | CONTENT_MATCH | 99.83 | 18/18 | TRUE_MATCH |
| extract | CONTENT_MATCH | 99.74 | 12/12 | TRUE_MATCH |
| shift | CONTENT_MATCH | 79.90 | 24/30 | TRUE_MATCH |
| slow | PARTIAL_MATCH | 45.43 | 13/26 | MISSED_MATCH |
| fast | PARTIAL_MATCH | 58.38 | 14/22 | MISSED_MATCH |
| fps | CONTENT_MATCH | 99.74 | 24/24 | TRUE_MATCH |
| missing | CONTENT_MATCH | 99.72 | 22/22 | TRUE_MATCH |
| duplicate | CONTENT_MATCH | 99.61 | 24/24 | TRUE_MATCH |
| reorder | NO_MATCH | 4.17 | 1/24 | MISSED_MATCH |
| hevc | CONTENT_MATCH | 99.61 | 24/24 | TRUE_MATCH |
| bitrate | CONTENT_MATCH | 98.70 | 24/24 | TRUE_MATCH |
| resolution | CONTENT_MATCH | 98.70 | 24/24 | TRUE_MATCH |
| compression | CONTENT_MATCH | 98.31 | 24/24 | TRUE_MATCH |
| brightness | CONTENT_MATCH | 99.09 | 24/24 | TRUE_MATCH |
| contrast | CONTENT_MATCH | 99.35 | 24/24 | TRUE_MATCH |
| salt-pepper | CONTENT_MATCH | 98.18 | 24/24 | TRUE_MATCH |
| noise | CONTENT_MATCH | 99.35 | 24/24 | TRUE_MATCH |
| overlay | NO_MATCH | 0.00 | 0/24 | MISSED_MATCH |
| crop | NO_MATCH | 7.16 | 2/24 | MISSED_MATCH |
| other-trip | NO_MATCH | 0.00 | 0/24 | TRUE_NEGATIVE |
| partial | CONTENT_MATCH | 74.74 | 18/24 | CORRECTLY_DETECTED_MODIFICATION |

## Candidate thresholds on this synthetic dataset only

Max F1; ties use the smallest distance threshold. These are exploratory fits to this dataset, not held-out accuracy or universal thresholds. There is only one negative trip, so zero false positives does not demonstrate a safe false-positive rate.

| Method / metric / threshold | TP | FP | TN | FN | F1 |
|---|---:|---:|---:|---:|---:|
| aHash/hamming/15 | 22 | 0 | 1 | 0 | 1.000 |
| aHash/normalizedHamming/0.234375 | 22 | 0 | 1 | 0 | 1.000 |
| dHash/hamming/6 | 22 | 0 | 1 | 0 | 1.000 |
| dHash/normalizedHamming/0.09375 | 22 | 0 | 1 | 0 | 1.000 |
| pHash/hamming/18 | 20 | 0 | 1 | 2 | 0.952 |
| pHash/normalizedHamming/0.28125 | 20 | 0 | 1 | 2 | 0.952 |
| wHash/hamming/15 | 22 | 0 | 1 | 0 | 1.000 |
| wHash/normalizedHamming/0.234375 | 22 | 0 | 1 | 0 | 1.000 |
| pHash/l1/24 | 22 | 0 | 1 | 0 | 1.000 |
| pHash/l2/3.75 | 22 | 0 | 1 | 0 | 1.000 |
| pHash/cosine/0.1 | 22 | 0 | 1 | 0 | 1.000 |

## Fuzzy byte-stream results

| Scenario | ssdeep similarity | TLSH distance |
|---|---:|---:|
| authentic | 100 | 0 |
| trim-start | 0 | 218 |
| trim-end | 0 | 243 |
| extract | 0 | 261 |
| shift | 0 | 166 |
| slow | 0 | 191 |
| fast | 0 | 210 |
| fps | 0 | 203 |
| missing | 0 | 178 |
| duplicate | 0 | 169 |
| reorder | 0 | 167 |
| hevc | 0 | 266 |
| bitrate | 0 | 354 |
| resolution | 0 | 319 |
| compression | 0 | 378 |
| brightness | 0 | 219 |
| contrast | 0 | 162 |
| salt-pepper | 0 | 453 |
| noise | 0 | 389 |
| overlay | 0 | 225 |
| crop | 0 | 208 |
| other-trip | 0 | 320 |
| partial | 0 | 217 |

The authentic file matches exactly; every re-encoded variant has ssdeep similarity 0. TLSH distances overlap between unrelated and transformed videos. Neither is a suitable stand-alone visual matcher. JavaScript ports were used (ssdeep.js digest with ssdeep comparison rules; tlsh 1.0.8 legacy format), not a claim of exhaustive compatibility with current native releases.

## Network recovery

- Temporary Internet loss: 12/12 received; 0 lost; 0 pending; 0 idempotent duplicates; PASS.
- Intermittent connectivity: 12/12 received; 0 lost; 0 pending; 0 idempotent duplicates; PASS.
- Generated offline: 12/12 received; 0 lost; 0 pending; 0 idempotent duplicates; PASS.
- Server unavailable: 12/12 received; 0 lost; 0 pending; 0 idempotent duplicates; PASS.
- Server downtime during send: 12/12 received; 0 lost; 0 pending; 0 idempotent duplicates; PASS.
- Recovery after outage: 12/12 received; 0 lost; 0 pending; 0 idempotent duplicates; PASS.
- Out-of-order arrivals: 12/12 received; 0 lost; 0 pending; 0 idempotent duplicates; PASS.
- Duplicate retry after lost acknowledgement: 12/12 received; 0 lost; 0 pending; 12 idempotent duplicates; PASS.

These use the production drain algorithm with fault-injected memory transport. Separate automated tests exercise persistent IndexedDB with fake-indexeddb. No live server was deliberately taken offline.

## Failure analysis

Default pHash misses the speed changes, reverse-order video, overlay and crop. Cosine performs better on these test patterns but can accept reordered scenes because the coarse spatial appearance remains similar. Reported anomalies should be reviewed even when content matches. The low-frequency Haar wHash variant is mathematically equivalent to block-average aHash here and should not be interpreted as independent evidence.

Sampling at 2 FPS cannot locate every individual deleted or duplicated frame. Use higher-density fingerprints and a larger dataset of independent, visually similar real trips for a defensible threshold. Partial replacement is an anomaly classification separate from content correspondence. Exact SHA-256 still rejects every byte-changing transformation.
