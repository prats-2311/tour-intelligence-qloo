# 5. BigQuery analytics: derived counts only, fail-safe, test traffic excluded

Date: 2026-10-31. Status: accepted.

## Context
We want the `/proof` page to show how the product behaves in real use: how many claims were checked and removed,
how fast playbooks are, how teams use workspaces. Qloo's terms forbid keeping its response data, and the product
promises not to store notes or documents. Analytics must not break a request, and our own test runs must not
inflate the numbers.

## Decision
- Analytics are optional and off by default. They turn on only when `BQ_DATASET` and `GOOGLE_CLOUD_PROJECT` are
  both set.
- Only derived values are written: counts, labels, latencies, booleans, card kinds, roles, the city and country a
  user typed, and sha256 hashes of session and workspace ids.
- Never written: any Qloo payload (entity names, affinities, card items), note or lead text, people's names, the
  artist name, document text, raw session or workspace ids, raw IPs.
- Three day-partitioned tables: `playbook_runs`, `team_events`, `v2_outcome_taps`. The operator creates them once
  with `scripts/bq_setup.sh`; the service never creates tables at runtime.
- Fail-safe: `Analytics.track` is a fire-and-forget buffer (20 rows or 5 seconds per table). It is never awaited on
  a request path and never throws. The stats routes answer `{enabled:false}` when analytics are off or a query
  fails, and the dashboard then hides its panels.
- Test traffic carries `test = TRUE` (a session id starting `e2e-` or `test-`, or the header `x-tiq-test: 1`).
  Stats queries count only rows where `IFNULL(test, FALSE) = FALSE`.
- Stats are one aggregate query each over the last 90 days, cached for 60 seconds.

## Consequences
- The trust meter and team-decisions panels on `/proof` show real usage and nothing else. With analytics off they
  do not appear, so a local run never shows made-up numbers.
- Rows written before the `test` column existed count as real. The operator can delete old test rows by hand.
- Logging is best effort: a crash or a BigQuery outage can lose rows. The counts are indicative, not an audit log.
- `verdict` and `gemini_calls` columns exist but are always null in `playbook_runs`, because a playbook has no board
  verdict and Gemini attempts are not exposed to the logger.
- The v2 "taps" are taps on a prototype, not real fans or bookings. The panel says so.
