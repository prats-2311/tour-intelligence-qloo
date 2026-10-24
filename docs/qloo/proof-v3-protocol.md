# Proof v3 protocol (committed before any Qloo or Gemini call)

Date: 2026-10-24. Decided by Prateek (city-ranking back-test is required; Option B, two batches of 6). We publish whatever comes out, including losses. No result is re-run to get a better number. A run is repeated only after an infrastructure failure, and then it is reported as such.

There are two tests:
- **Test A, city ranking:** does winnability pick the cities a tour actually played better than fan heat alone, a generic LLM, or population? This is the product's core claim.
- **Test B, fixed candidates:** for the 27 reviewed activation cases, does Qloo `rank` place the real pick higher among 10 candidates than Gemini or popularity?

## Test A: city ranking

### Artists (fixed before any call)
1. **Pool:** every article in the English Wikipedia categories "2023 concert tours" and "2024 concert tours", fetched once through the MediaWiki API. The raw member list is saved in `backtest/city/pool-raw.json`.
2. **Eligibility.** Keep a tour if all of the following hold:
   - (a) it has a date or venue table listing cities;
   - (b) it played ≥ 8 shows in the United States, Mexico or Brazil combined;
   - (c) at most 2 of those shows are in a venue whose name contains "Stadium", "Estadio", "Stadion" or "Field". This excludes stadium acts, and the product is for mid-tier artists.
   - (d) it has a single headlining artist (no co-headline or festival tours);
   - (e) the artist is not Japanese Breakfast, Khruangbin, Mac DeMarco or Natalia Lafourcade (the calibration and showcase artists).
   - If an artist has several eligible tours, keep the one with the most US/MX/BR shows; break ties by the earlier start date.
3. **Order:** sort the eligible artists by `sha256(lowercase artist name)` in hex, ascending. Positions 1–6 are batch 1 and positions 7–12 are batch 2. The ordered eligible list is saved in `backtest/city/artists.json` before any Qloo or Gemini call.

### Ground truth
- The played cities are the US/MX/BR show cities from the tour article's table.
- Each show city is mapped to a city id in `cities5000` with the board's own anchoring rule: the most populous city within 30 km, with metro cores allowed per `METRO_CORE_REACH_KM`. So "Inglewood" becomes Los Angeles, the same way the board treats suburbs.
- Shows that can't be mapped are listed and dropped.
- Saved in `backtest/city/cases.json`, together with the article URL and revision id for each tour. This is public Wikipedia data and contains no Qloo data.

### Board inputs
- **Regions:** the subset of {United States, Mexico, Brazil} the tour played, in that order.
- **Board settings:** the live board pipeline with its default settings: shortlist 8, the major-market seeds, and calibration `calibrated-2026-10-17` (whatever is committed at run time; the version is recorded in the results).

### Candidates (the same list for every arm)
1. Start with the board's own scored cities (heat candidates plus major-market seeds) from the live pipeline.
2. Add played cities not already present, in `sha256(artist + city id)` order, until the list has 14 cities or no played cities remain.
3. Every added city is scored by the same pipeline: location check, activation, verdict.
4. A city added this way that isn't in Qloo's regional heat list gets fan heat at the board's floor, exactly as a major-market seed does.

This is a known property of the method, stated in the results: the two Qloo arms can't rank a city Qloo shows no fan heat for, and they are not given a pass on that.

### Arms (each ranks the same candidate list, best first)
1. **Winnability:** the board's winnability score. Unscored cities ("couldn't place") go last. Ties are broken by the hash order above.
2. **Fan heat:** the board's fan-heat score ("density"), with the same tie and unscored rules.
3. **Generic LLM:**
   - Gemini (`GEMINI_MODEL`, fallback `GEMINI_FALLBACK_MODEL`), temperature 0.2.
   - It gets the candidate names and countries in alphabetical order and no Qloo data.
   - Fixed prompt: "You are a concert booking agent. Rank these cities from best to worst for a headline tour by {artist} in {first show year}. Return every city exactly once." The response schema forces a permutation.
   - A non-permutation is retried once. If it fails again, the arm is "no answer" for that artist and the artist is excluded from that arm's sign test.
4. **Population:** `cities5000` population, descending.

### Metrics
- **R-precision per artist and arm.** With N = the number of played cities in the candidate list, it is (played cities among the arm's top N) / N.
- **Mean R-precision per arm**, over the artists the arm answered.
- **Sign tests:** two-sided exact binomial with ties dropped, per artist. Primary comparisons are winnability vs fan heat and winnability vs LLM. Winnability vs population is secondary.
- **Reporting:** every artist is shown with N, the four R-precisions and the cities each arm got right. Losses are named, e.g. "LLM beat winnability for X".
- **Claims:** a win is claimed only where the mean is higher AND the sign test gives p < 0.05. Otherwise we report a difference that isn't significant at this sample size. If winnability beats fan heat but the LLM leads, we say exactly that.

### Batches and stop rule
- Batch 1 is artists 1–6. Batch 2 is artists 7–12, and runs only after batch 1 completes cleanly, after it has been reported, and after Prateek's go-ahead.
- **Stop at once** on any of:
  - a Qloo 429;
  - any response mentioning quota, rate limit or limit;
  - an error rate above 10% of calls over the last 20 calls.
- A stopped batch keeps its finished artists. A partly-scored artist is dropped and listed.
- If batch 2 never runs, publish the 6 artists as "6 of a planned 12" with the reason.
- **Budget:** about 95 Qloo calls and 1–2 Gemini calls per artist. Each artist gets its own session id (`proof-v3-city-<n>`), under the 160-call session budget.

### Known limits (published with the results)
- **Data timing:** Qloo's taste data is current, not as of the tour date, so some fan heat may reflect the tour itself. Gemini's training data may include the tour.
- **What it tests:** the test checks agreement with the routing an agent chose, not whether those cities were the most profitable.
- **Sample size:** 12 artists (or 6) is a small sample, so the sign test has low power.

## Test B: fixed-candidate rank (activation picks)
- **Cases:** the 27 reviewed cases in `backtest/cases.json` (14) and `backtest/cases-run2.json` (13).
- **Candidates per case:** 10 in total, the real pick plus 9 decoys.
  - The decoys come from the case's city popularity list for its target type (`cityPopularityArgs(target, "<city>, <country>", 20)`), excluding the real pick.
  - The 9 are chosen by `sha256(case id + decoy name)` ascending.
  - If fewer than 9 decoys exist, the case is reported as "too few candidates" and excluded.
- **Arms:**
  - Qloo `rank`: `{options: the 10 entity ids, option_type, signals: [artist id], signal_location: "<city>, <country>"}`;
  - Gemini: the same 10 names, alphabetical, the fixed prompt "Rank these for a {activation type} with {artist} in {city}", temperature 0.2, a forced permutation;
  - popularity: the order of the popularity list.
- **Metric:** mean reciprocal rank of the real pick per arm. Sign tests: Qloo vs Gemini and Qloo vs popularity (two-sided exact, ties dropped). The same claim rule as Test A applies.
- **Budget:** about 27 popularity lists (partly cached), 27 resolves and 27 rank calls ≈ 60–90 Qloo calls; about 27–54 Gemini calls.

## Claim-checker catch rate
- **Claims:** 30 claims built from the recorded showcase playbooks. 10 of them are planted false, by changing one number or one entity name, chosen by `sha256(claim text)` ascending.
- **Check:** all 30 go through `verifyClaims` with the playbook's own evidence.
- **Reported:** the catch rate (planted claims removed / 10) and the false-alarm rate (true claims removed / 20). No Qloo or Gemini calls are needed.

## Outputs
- `private-data/backtest/proof-v3-*.json`: raw results, which include Qloo-derived ranks, so they stay private.
- `/proof` shows Test A first, then Test B, the catch rate and the earlier runs, each with its method note.
- The README quotes only the published summary numbers.
