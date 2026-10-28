# 3. Recordings private, tests synthetic

Date: 2026-10-17. Status: accepted.

## Context
Qloo's developer guide forbids storing Qloo response data in a public repository. The judged demo needs real
Qloo output (a recorded board, city playbooks, answers) and the repo must become public with an MIT licence.
Tests that need realistic shapes must still run in CI on a clean clone.

## Decision
- Real Qloo-derived files (showcase recording, backtest results, calibration inputs, Proof v3 outputs) live in
  `private-data/`, which is git-ignored. They are served by the dashboard server from `RECORDINGS_DIR`
  (private storage in production) and never bundled into the SPA.
- Everything committed uses synthetic fixtures (the invented Lumen Vale tour; ids with the `00000000-`
  prefix). Calibration inputs are real recordings and are private too. Tests never depend on private files;
  the ones that can use them skip when absent.
- `scripts/check-public-data.sh` runs in CI and in `scripts/make-public-clone.sh`; it fails on tracked private paths
  and on real (non-synthetic) entity ids. The public repo is a filtered clone of this branch.
- Published aggregates (counts, means, p-values) are not Qloo response data; entity names from private data are
  not quoted in docs beyond what the live app already shows (city and artist names).

## Consequences
- The public repo cannot reproduce the exact recorded numbers without the author's private files; the
  commands to regenerate them are documented and spend real quota.
- A fresh clone runs green on synthetic data, and a judge sees the real run through the live app.
- Re-recording is a manual, quota-spending step; the app labels recorded data with its recording date.
