# Activation backtest

Question: for real past tours, would the Qloo-powered City Playbook have surfaced the activation that actually happened in that city?

- `candidates.json`: cases proposed from public sources (artist, city, the sponsor / merch partner / local act, dates, source links). Never trusted on their own.
- `cases.json`: only the cases Prateek reviewed and accepted (`review.status: "accepted"`). This is the only file the runner scores.
- `results.json`: the runner's output. `/proof` renders a committed copy (`dashboard/src/lib/qloo/fixtures/backtest.json`).

Each case is scored three ways, with the same top-10 cut:
1. **Qloo playbook:** the exact Qloo recommend request the City Playbook makes (artist signal + city), limit 20.
2. **City popularity:** the same request without the artist, which tests whether the artist's taste adds anything beyond "what's popular in this city".
3. **Generic LLM:** Gemini, same question, no Qloo and no web search.

A hit is the real entity in the top 10 (primary) or the top 20 (secondary), matched by Qloo entity id when both sides have one, otherwise by normalised name or listed alias.

Limitations: Qloo's graph (and the LLM's training data) may already reflect these past activations (post-hoc leakage); we cannot control for this. The backtest shows consistency with real decisions, not causal lift. The sample is small and says so.

Re-run: see "Run the backtest" in the root README.
