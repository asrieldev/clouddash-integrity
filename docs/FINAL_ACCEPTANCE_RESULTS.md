# CloudDash Integrity final acceptance results

Run date: 3 October 2026

## Outcome

- Production sign-in: passed at `https://clouddash-integrity.vercel.app/`.
- Automated tests: 39 passed, 0 failed.
- Production build: passed with Vite 6.4.3.
- Evaluation dataset: 23 video scenarios generated with 0 generation errors.
- Threshold measurements: 1,265.
- Network recovery scenarios: all passed.
- Partial replacement: correctly detected. The engine marked 0–4 seconds and 7–12 seconds as consistent, and 4–7 seconds for review.

## Partial-edit evidence

The controlled test replaces the middle of a 12-second video between 4 and 7 seconds. At the default pHash/normalized-Hamming configuration, CloudDash returned `CONTENT_MATCH`, 18 of 24 aligned fingerprints (75%), and an `UNMATCHED_SECTION` from 4.0 to 7.0 seconds. This means the overall trip is related to the trusted recording, but the middle interval requires review. It must not be treated as exact authenticity.

Original SHA-256:

`4F60292D79810F31BFD89F35122E426079987F6DF7A137782B559AC601D216AC`

Edited SHA-256:

`5A0E2FB4C188CD528E11690CD82BBC4C7BBDDE650F9F01011C056DF8652072F6`

## Evidence files

The screenshots and comparison frames used in the final Word report are in `docs/evidence/`. Machine-readable evaluation output is generated locally in `tmp/final-acceptance/evaluation/results.json` and `results.csv`; these large reproducible artifacts are intentionally not committed.

## Interpretation rule

`VERIFIED` means the file bytes, trusted record, signature, identity, and chain checks all passed. `CONTENT_MATCH` means perceptual similarity only. It helps an insurance reviewer find retained and changed sections but is not proof that the submitted file is authentic.
