# Activation calibration — calibrated-2026-10-17

Inputs: 32 scored cities from 4 recorded Tour Board runs (Japanese Breakfast, Khruangbin, Mac DeMarco, Natalia Lafourcade). Backtest cases were not used. The trimmed inputs are committed in `cloud_run/qloo_gateway/test/fixtures/calibration/`; re-run: `node dist/scoring/calibrateCli.js --in test/fixtures/calibration/*.json --version calibrated-2026-10-17 --write src/scoring/calibration.ts --report ../../docs/qloo/calibration.md` (from `cloud_run/qloo_gateway`).

| Config | Activation range | IQR | Fragile cities (±1 point) | Verdicts |
|---|---|---|---|---|
| Before (default) | 51.5–96.8 | 2.67 | 5 | play 15, consider 10, hidden_goldmine 6, skip 1 |
| After (calibrated) | 0.0–52.0 | 24.09 | 4 | play 12, consider 10, skip 7, insufficient_data 1, de_risk 1, hidden_goldmine 1 |

Affinity floors: sponsor_fit 0.92, local_hooks 0.95, venue_fit 0.88.
Dropped (no spread across calibration cities): none.
Thin-data cities made insufficient_data (rule 8): 1.
Close calls (verdict changes within ±2 points): 10 before, 10 after.
Gates: passed.
