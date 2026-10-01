# Video matching and reliability evaluation

## Why failures were absent

The old Decoder kept its results only in React state. The integrity page independently audited cloud chains; it never received submitted-file failures. The new shared history saves all statuses, including `FILE_HASH_MISMATCH`, `FINGERPRINT_NOT_FOUND`, signature/chain failures and `ERROR`. Browser storage preserves attempts during server outages and retries on reconnect or refresh. An unavailable history table is reported explicitly.

Reliability is an operational pass rate over actual exact-video verification attempts. It is undefined before any completed checks. Repeated checks count as repeated attempts. Manifest and evaluation records are logged separately. Errors do not assert that evidence was altered and are displayed separately from failed checks. The audit table is append-only to authenticated clients under workspace RLS; client-reported results are not a tamper-proof, independently computed server verdict.

## Using the lab

1. Load the generated dataset, upload original reference videos, or load valid signed cloud profiles. Original uploaded references are local benchmark material, not trusted capture attestations.
2. Select test videos and their scenario. For mixed batches, select the generated `manifest.json` so each file has its own ground truth. The `reference` field identifies the expected original filename/segment.
3. Choose a hash and distance, or compare all methods. Enable threshold sweep to evaluate five candidate distances.
4. Run evaluation. Each row reports correspondence, reference trip/segment, reference start/end, temporal offset, speed estimate, match score, matched samples/percentage, anomalies, extraction and matching time, and classification.
5. Export JSON for all alignment pairs and anomalies. The CLI additionally produces CSV. Save/export before leaving the lab; its per-case reports are held in page memory. Cloud history records the batch summary.
6. Run network failure scenarios for transport recovery metrics. Tests are clearly identified as fault injection, not a real server shutdown.

## Covered cases and expected semantics

| Family | Cases | Expected content behavior |
|---|---|---|
| Temporal | Beginning/end trim, extracted excerpt, 3-second shift, 0.9×/1.1× timestamp scaling, changed FPS, missing group of frames, duplicated frames, reversal | Seek a corresponding subsequence; report gaps/order/time-scale anomalies. Reversal is a deliberately difficult order test. |
| Transformations | H.264→HEVC, bitrate, resolution, compression, brightness, contrast, salt/pepper and moderate noise, overlay, crop | Correspondence is positive ground truth, even when a method misses it. Exact SHA-256 must still reject changed bytes. |
| Authenticity | Exact original, re-encoded, trimmed, missing frames, transformed, different trip, partially replaced | Another trip is negative. Partial replacement should expose inconsistent sections even if most of the clip matches. |
| Transport | Temporary loss, intermittent access, offline generation, unavailable server, downtime mid-send, restored network, out-of-order arrival, duplicate retry | Durable outbox, no acknowledged identity overwrite, idempotent retry, sequence reconstruction. |

## Fingerprints and distances

Browser decoding samples luminance every 0.5 seconds onto a 32×32 grid. aHash uses 8×8 block means; dHash compares adjacent samples; pHash uses the low-frequency 8×8 DCT with DC excluded from the median. The wHash implementation uses a two-level Haar approximation; this low-frequency-only choice equals block averaging and is **not independent evidence** from aHash. All are 64-bit binary hashes. The vector is a standardized 8×8 luminance grid.

- Hamming: differing bits, range 0–64; default maximum 12.
- Normalized Hamming: Hamming/64; default maximum 0.1875.
- L1: sum of absolute vector differences; default 32.
- L2: Euclidean vector distance; default 5.
- Cosine distance: `1 - cosine similarity`; default 0.2. Zero-information vectors are rejected.
- ssdeep: byte-stream piecewise fuzzy hash with similarity 0–100; higher is closer. The JavaScript digest port is paired with block-size-aware ssdeep comparison rules.
- TLSH: legacy 70-character digest via `tlsh` 1.0.8, including length in the distance. This port requires at least 512 bytes and sufficient complexity. Missing/low-entropy hashes are unavailable, never zero-distance matches.

Fuzzy scores are computed on compressed video bytes, not visual frames, so re-encoding can destroy similarity. The real benchmark shows this directly. For an optional native cross-check, install `ssdeep` and `py-tlsh` in a suitable Python/native build environment and run `python scripts/fuzzy-metrics.py <manifest.json>`. Missing native libraries are reported as unavailable. JavaScript port results are not a claim of exhaustive compatibility with current native releases.

References: [ssdeep project](https://github.com/ssdeep-project/ssdeep), [TLSH original implementation](https://github.com/trendmicro/tlsh), [JavaScript TLSH port](https://github.com/idealista/tlsh-js), [ssdeep.js digest port](https://github.com/cloudtracer/ssdeep.js), [Supabase insert API](https://supabase.com/docs/reference/javascript/insert).

## Alignment and decisions

Local sequence alignment allows gaps for missing/duplicated samples and does not require synchronized start times or identical FPS. It returns a monotonic path through query and reference samples. Accepted content matches require at least three informative pairs and at least 70% query coverage. Brightness-flat frames cannot establish a match. Unmatched query spans and skipped reference sections are returned with timestamps. Nearest-neighbor regressions flag possible reordering; repeated scenery can trigger these flags. Speed is an estimate from the first/last aligned sample, not a calibrated clock measurement.

Score is coverage multiplied by normalized similarity, expressed on 0–100. It is **not a statistical confidence probability**. The cloud loader first checks signatures, chains and the canonical SHA-256 digest of each perceptual profile. Version-3 ECDSA signatures bind that digest. Cloud trip timelines concatenate contiguous segment durations; these positions are relative to the included sequence, not absolute UTC clock synchronization. Missing original profiles cannot be reconstructed from SHA-256.

## Threshold selection and experimental design

The app and CLI report TP/FP/TN/FN, precision, recall and F1 per configuration. Modification detection is reported separately from correspondence, since a partially replaced video can retain a true matching portion. The saved report selects candidate thresholds by maximum F1 on the **synthetic calibration examples**, with lower thresholds breaking ties. This is exploratory fitting, not held-out accuracy.

For coursework results, collect independent real trips with visually similar roads, stopped traffic, darkness, weather and multiple cameras. Split by trip, never by frames from the same trip. Fit thresholds on the calibration trips, freeze them, and measure false-positive/false-negative rates on held-out trips. Include negative trials against every plausible reference trip. Report frame/section anomaly localization separately from video-level correspondence. Ground-truth scenario labels describe the experiment; they must never influence the matching algorithm itself.

## Quantitative results and limitations

See [RESULTS.md](evaluation/RESULTS.md) for measured results, including the failures. The bundled dataset has one original synthetic sequence and one synthetic negative source; it is a reproducible smoke benchmark, not evidence of real-world reliability.

- At 2 FPS, edits between sample times can be missed. Individual missing/duplicated frames are not guaranteed detectable. Higher sampling and optical/learned features would be needed for that guarantee.
- Crop, overlay, fast-changing frames, speed changes, short clips and repeated scenes can fail or cause ambiguity. Hash methods are deliberately compared rather than promising invariance.
- HEVC browser decoding may fail. The CLI can decode it using FFmpeg and records generation/decode errors.
- Browser queries are limited to 10 minutes, 1,200 samples and 128 MiB. Combined reference timelines are limited to 2,400 samples. Matching runs in a worker to keep the interface responsive.
- IndexedDB is tied to a browser profile/device. Clearing browser storage or device loss destroys unsent evidence; it is not a backup. Storage quota errors must be resolved before relying on capture.
- Transport tests exercise production queue logic with injected failures and separately test IndexedDB persistence. Live multi-device/server outage testing remains an operational validation step.
- SHA-256 detects any byte change, but cannot name which visual edit was performed. Perceptual content matches never waive signature, hash-chain or exact-byte checks.

## Reproduction

`npm run evaluate -- --out tmp/new-run --sweep` generates and evaluates every case. Provide `--source` and `--other` for different real trips. The generator uses the first 12 seconds, normalizing the reference to H.264; the benchmark's authentic case is byte-identical to that normalized reference. Existing dataset directories are not overwritten.

`node scripts/evaluate-fuzzy.mjs tmp/new-run/manifest.json` repeats just the fuzzy comparison. `node scripts/publish-evaluation-fixtures.mjs tmp/new-run` bundles **synthetic-only** fixtures for the website and writes the measured summary. It refuses automatically bundling real-trip media.


## Website metric evaluation (October 2026)

Open **Evaluation lab** (or `/evaluation-local` without signing in). Add original videos and transformed test videos, select their ground-truth scenario, then click **Evaluate videos**. Alternatively load the 23 synthetic scenarios with their supplied labels. All four perceptual hashes, both Hamming variants, the three vector distances, and threshold sweeps are enabled by default. Fuzzy scores are calculated for source-file bytes where available.

Results include mean accepted-frame distance, expandable individual frame distances, cosine similarity, confusion counts, precision, recall, F1, and provisional threshold suggestions. The mean excludes rejected and unaligned frames; use coverage and missed-match counts alongside it. Suggestions maximize F1 over tested thresholds, then prefer fewer false matches and a stricter threshold. Both matching and non-matching examples are required. These are dataset-specific calibration suggestions, not independently validated thresholds. Export report includes recommendations and frame pairs. Clear results before starting an unrelated dataset.

The wHash variant uses a Haar low-frequency approximation and may equal aHash. Vector metrics operate on standardized 8×8 luminance samples, not pHash bits. Fuzzy scores measure encoded file bytes, not decoded visual similarity. TLSH may be unavailable for short or low-entropy data. The pinned TLSH package's undeclared loop counters are repaired by `npm install`/`npm ci` via `scripts/patch-tlsh.mjs`; a strict browser-bundle regression test covers this.

Downloaded recorder videos can also be tested directly under Verify evidence > Open video file. The verifier runs the 11 perceptual/vector configurations and both fuzzy scores against the signed recorded profile. Select Original recorded segment for renamed or edited copies, or load its signed manifest. Exact integrity remains independent of content similarity. Missing profiles and unsupported codecs are explicitly reported; older recordings must be captured again to store frame fingerprints. Manual incident verification also populates this comparison table.
