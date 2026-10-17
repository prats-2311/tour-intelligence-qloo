# Activation backtest

Question: for real past tours, would the Qloo-powered City Playbook have surfaced the activation that actually happened in that city?

- `candidates.json`: cases proposed from public sources (artist, city, the sponsor / merch partner / local act, dates, source links). Never trusted on their own.
- `cases.json`: run 1. 14 cases (9 local act, 4 merch collab, 1 sponsor) that Prateek reviewed and accepted on 2026-10-17 (`review.status: "accepted"`). Method v1.
- `candidates-run2.json` and `cases-run2.json`: run 2. 13 fresh local-act cases, reviewed and accepted by Prateek on 2026-10-17 after the local-act method changed. No artist–city pair repeats run 1's. Method v2: the city's popular artists re-ranked with `qloo_rank` by taste fit.
- The runner scores one cases file per run (only `review.status: "accepted"` cases).
- `results.json` (run 1, run at 2026-10-17T00:41Z) and `results-run2.json` (run 2, 2026-10-17T01:33Z): the runner's output. `/proof` renders committed copies of both (`dashboard/src/lib/qloo/fixtures/backtest.json`).

Each case is scored three ways, with the same top-10 cut:
1. **Qloo playbook:** the exact Qloo recommend request the City Playbook makes (artist signal + city), limit 20.
2. **City popularity:** the same request without the artist, which tests whether the artist's taste adds anything beyond "what's popular in this city".
3. **Generic LLM:** Gemini, same question, no Qloo and no web search.

A hit is the real entity in the top 10 (primary) or the top 20 (secondary), matched by Qloo entity id when both sides have one, otherwise by normalised name or listed alias.

A case counts toward Qloo's numbers only when the artist resolves in Qloo: both Qloo methods have to be scored on the same cases, so an unresolved artist makes both `unavailable` (`artist_unresolved`). Unavailable answers are shown as "no answer" and leave that method's denominator; they are never counted as a miss. In run 1 one case (Ca7riel & Paco Amoroso, Mexico City) was unresolved, which is why Qloo methods are scored on 13 cases and the LLM on 14.

Headline (real entity in the top 10): run 1 playbook 1/13, city popularity 1/13, LLM 3/14; run 2 playbook 1/13, city popularity 1/13, LLM 7/13. The playbook did not beat a baseline.

Limitations: Qloo's graph (and the LLM's training data) may already reflect these past activations (post-hoc leakage); we cannot control for this. The backtest shows consistency with real decisions, not causal lift. The sample is small and says so.

Re-run: see "Run the backtest" in the root README.
