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

## Amendment 1 (2026-10-24, before any Qloo or Gemini call)
**Why:** the first eligible list (commit 96b2ed6) showed two design flaws. We saw the artist names and their show counts, and no outcome of any arm.
- **Flaw 1:** rule (c) let arena acts through (Bob Dylan, Sting, Sabrina Carpenter, Tears for Fears, Weezer, Lil Nas X). The product is for mid-tier artists.
- **Flaw 2:** for very large tours (Bob Dylan played 93 distinct cities), nearly every candidate is a played city. R-precision then approaches 1 for every arm, so the test measures nothing.

**Changes:**
1. **Rule (c) is replaced.** A tour is excluded if more than half of its US/MX/BR shows are in venues whose name contains any of: Stadium, Estadio, Stadion, Field, Arena, Center, Centre, Coliseum, Dome, Garden, Amphitheatre, Amphitheater, Pavilion, Bowl, Speedway, Fairgrounds (case-insensitive).
2. **New rule (f):** the tour played between 6 and 30 distinct US/MX/BR cities after anchoring.
3. **Candidates:**
   - Start from the board's scored cities.
   - Add played cities in `sha256(artist + city id)` order while played cities make up at most half of the list and the list has at most 14 cities.
   - If the board's own cities already include more played cities than unplayed, keep them all, add nothing, and flag the artist as "board mostly played".
4. **Chance level:** each artist's chance R-precision (N / candidate count) is reported next to the four arms, along with the mean chance level over all artists.

Everything else stands: artist order by sha256, batches of 6, the stop rule, metrics, the claim rule and the published limits. The eligible list is regenerated under the amended rules, and `backtest/city/artists.json` and `cases.json` are replaced. The first list stays in git history (96b2ed6).

## Amendment 2 (2026-10-24, before any Qloo or Gemini call)
**Why:** the runner review (task 4a) found that Amendment 1's candidate rule biases the comparison.
- Every added city was a played city, and every added city sits at or below the fan-heat floor.
- So "added" leaked "played". The fan-heat arm was capped, while winnability's activation half could lift added cities. "Winnability beat fan heat" would have been close to guaranteed.

No Qloo or Gemini call has been made.

**Changes:**
1. **Balanced extras.**
   - After the board's own cities, extras are added in pairs: one played city (in `sha256(artist + city id)` order), then one unplayed decoy.
   - **Decoys:** cities in `cities5000` in the artist's regions (ISO-2 of each region) that were not played, are not already candidates, are within the location-check rules, and have population ≥ the smallest played city's population. They are taken in `sha256(artist + "decoy" + city id)` order.
   - Pairs are added while the list has ≤ 14 cities and played cities are ≤ half of it.
   - Decoys are scored by the same pipeline. Like played extras, they get floor fan heat when absent from Qloo's heat list.
   - Among extras, then, fan heat carries no information: they tie at the floor and are ordered by the hash tie-break. Any advantage winnability gains there comes only from activation, which is the claim being tested.
2. **Board-only comparison** (reported alongside the full list): R-precision of winnability vs fan heat over the board's own cities only, where both arms have real Qloo fan heat. This is secondary.
3. **Claim rule:** "X beat Y" now requires a higher mean, more per-artist wins than losses, and a sign test p < 0.05.
4. **Played-city anchoring:** the runner re-anchors every played city from `cases.json` with the board's own anchoring function at load time, so the ground truth and the board use identical city ids. Any change is listed in the results.
5. **Test B decoys** exclude the case's real pick by entity id, by name and by every alias.
6. **Catch rate:**
   - **Planting:**
     - half of the number plants use a number that appears elsewhere in the playbook's evidence but not in the cited cards (a plausible wrong number);
     - the other half use a number absent from all evidence;
     - entity plants swap in a name that appears in another card.
     - Each plant changes exactly one token.
   - **Reported:** the catch rate for each plant type. The false-alarm rate is not presented as a finding, because true claims are drawn from claims the verifier already accepted; we say so.
   - If plausible-wrong plants are missed, that is reported as a limit of the checker.
7. **Stop rule coverage:**
   - Any error envelope whose code or message matches rate/quota/limit, any `stale: true` answer (a cached fallback served because a live call failed), and any HTTP 429 from Cloud Run all stop the run at once.
   - A region whose heat lookup is unavailable drops that artist, and the drop is listed.
   - All Gemini models failing for an artist is an infrastructure failure, not "no answer". The run stops and it is reported.

## Amendment 3 (2026-10-24, infrastructure only, before re-running Test B)
**What happened:** Test B's first run stopped after 12 Qloo calls (0 Qloo errors) and 3 Gemini calls. Two of the Gemini calls failed with intermittent HTML 404 pages from the Vertex front end; the same requests returned 200 minutes later, on both models. The stop rule counted each failed Gemini model attempt toward the 10% error rate, even when the fallback model then answered.

The stopped run is kept (`private-data/backtest/proof-v3-fixed.stopped-1.json`) and reported. Under the protocol's rule, this counts as an infrastructure failure.

**Changes:** these affect only infrastructure handling, not candidates, arms, metrics or claims.
1. **Gemini retries:** a Gemini call that fails with HTTP 404, 429 or 5xx, or a non-JSON body, is retried up to 2 times with backoff (2 s, 6 s) before moving to the fallback model.
2. **Error-rate stop:** the 10% error-rate rule counts Qloo calls only.
3. **Gemini stop:** a Gemini answer counts as failed only when every model has failed after its retries, and that already stops the run as an infrastructure failure.
4. **Unchanged:** the Qloo stop conditions (429, rate/quota/limit, stale answers) stay exactly as they are.

Test B is re-run from the start under this amendment. Test A batch 1 had no stop and is unaffected; its 1 Gemini error was covered by the fallback.

## Amendment 4: Test C, grounding (2026-10-24, before any Test C call)
**Question:** do the names a playbook gives (venues, sponsor brands, local acts) really exist in the city? We compare Qloo's playbook as shipped against an LLM-only playbook for the same artist and city. Decided by Prateek.

**Artist and cities (fixed rule):**
- The artist is the showcase artist, Mac DeMarco.
- The cities are every city on the recorded showcase board (recorded 2026-10-24) that has both a fan-heat and a winnability score, ordered by `sha256(city id)` ascending, at most 10.
- Expected list: Portland, Austin, Los Angeles and New York City (US); Mexico City and Guadalajara (MX); São Paulo, Salvador and Fortaleza (BR). That is 9 cities.
- Oaxaca is excluded because Qloo couldn't place it. If the recorded board differs from this list, the recorded board wins and the difference is reported.

**Arms and caps (the same caps for both arms):** at most 4 venues, 4 brands and 3 local acts per city.
- **(a) Qloo playbook as shipped:** the City Playbook pipeline run through the gateway (session `proof-v3-ground-<city id>`, narrative off).
  - Venues: the venue card items (music-venue categories plus the same-city filter), in card order.
  - Brands: the sponsors card items, in card order.
  - Local acts: the Local acts (talent) card items, in card order. This is the shipped hybrid, where Gemini proposes and Qloo verifies.
  - Fewer items than the cap are recorded as they are.
- **(b) LLM-only:**
  - Gemini (`GEMINI_MODEL`, fallback `GEMINI_FALLBACK_MODEL`, the Amendment 3 retry rules), temperature 0.2, no Qloo data.
  - The response schema has three string arrays, capped as above.
  - Fixed prompt: "You are planning a concert in {city}, {country} for {artist}. List up to 4 real music venues in {city}, up to 4 real brands that could sponsor the show, and up to 3 real local artists from {city} who could open. Only names that exist in {city}."
  - Fewer items are recorded as they are. An invalid JSON answer is retried once, then recorded as no answer for that city.

**Blinded review sheet:**
- **Rows:** all names from both arms, de-duplicated per (city, category, normalised name). A name that both arms gave becomes one row credited to both.
- **Order:** rows are sorted by `sha256(city + category + name)`.
- **Columns:** row id, city, country, category, name, a free map-search link (`https://www.google.com/maps/search/?api=1&query=<name> <city>`) and a free web-search link. No arm, score or source field.
- **Key:** the arm key is written to a separate private file, `private-data/backtest/proof-v3-ground-key.json`, that the reviewer does not open.
- **Format:** the sheet is a local HTML page in `private-data/backtest/` with one radio choice per row: "Exists, in this city" / "Exists, in another city" / "Doesn't exist" / "Can't tell". Answers are kept in the browser, with a "Download CSV" button.
- **Reviewer:** Prateek.
- **Expected size:** at most 9 × 2 × 11 = 198 rows before de-duplication.

**Metric and claims:**
- Per arm and per category: the share of rows rated "Exists, in this city". "Can't tell" rows are excluded from the denominator and reported as a separate count.
- Per city, per arm: the same share over all three categories.
- Sign test: a paired, per-city, two-sided exact sign test, Qloo vs LLM, ties dropped.
- The claim rule is as before: a higher mean, more city wins than losses, and p < 0.05. Otherwise the result is reported as "what we learned".
- Every row's rating is published in aggregate only. The names stay private, because Qloo-returned names are Qloo data.

**Budget and stop rule:**
- About 9 playbooks, roughly 4 of them cached from the showcase recording, at ≤ 11 Qloo calls each, plus location checks: ≈ 60–110 Qloo calls.
- Gemini: 9 calls for the LLM arm plus up to 9 for the shipped local-acts suggestions: ≈ 10–30.
- No Tavily.
- The same stop rule as Amendment 3 applies.

## Amendment 5: Test C rating definitions and a secondary analysis (2026-10-24, before any Test C call or rating)
**Why:** the Test C review found two gaps.
- "Exists, in this city" was undefined per category. The shipped Local acts card can include popular artists who are not from the city, and most brands are national.
- The venue card holds at most 3 items, while the LLM may return 4.

**Rating definitions.** These are printed at the top of the sheet and are binding for the reviewer.
- **Venue:**
  - "Exists, in this city": a real venue that hosts live music or performances, located in this city or its immediate metro area.
  - "Exists, in another city": real, but elsewhere.
- **Brand:**
  - "Exists, in this city": a real brand that sells or operates in this city's country.
  - "Exists, in another city": real, but not present in that country.
- **Local act:**
  - "Exists, in this city": a real artist based in or from this city or its metro area.
  - "Exists, in another city": a real artist from somewhere else, including famous acts that are merely popular there.
- **All categories:**
  - "Doesn't exist": no evidence the name exists as described (a venue, a brand, or a music act).
  - "Can't tell": evidence is unclear after a quick map and web check.

**Disclosure:** the reviewer (Prateek) has seen the shipped showcase playbooks for these cities. The sheet carries no arm information, but this rating is not fully blind to prior exposure.

**Secondary analysis (pre-registered, same ratings, no new rows):** truncate each arm per city and category to the smaller of the two arms' counts, using the recorded ranks, then recompute the shares and the paired sign test. The primary result stays as defined in Amendment 4.

**Method note** (published with the results): the Qloo arm runs the City Playbook with narrative off. This matches the shipped hybrid local-acts path but not the narrative text, which plays no part in Test C.

## Amendment 6: Test C run ceiling (2026-10-28, budget only, before any rating)
**What happened:** Test C's first run stopped at the runner's 198-call ceiling after 8 of 9 cities, with 0 Qloo errors and 0 Gemini errors. That ceiling was added in a code review as 9 × 22. It counts every gateway call, cached answers included. The pre-registered budget was an estimate (Amendment 4: about 60–110 real calls), not a stop rule. Real playbooks cost about 25 gateway calls each.

**Change:**
- The run ceiling becomes 260 gateway calls.
- Test C is re-run from the start. The stopped run is kept (`proof-v3-ground-items.stopped-*.json`) and reported.
- The re-run regenerates the LLM-only lists, at temperature 0.2. No rating existed when this was decided, so no outcome was known.
- All other rules are unchanged.

## Amendment 7: Gemini + Qloo combined, on existing Test A and B data (2026-10-29, after Tests A and B were published, before any combined number was computed)
**Why:** every test so far compares Qloo *instead of* an LLM. The product ships the LLM *plus* Qloo: Gemini proposes, Qloo ranks and checks. This amendment tests the combination. It uses only rankings already stored in `proof-v3-fixed.json` (Test B) and `proof-v3-city-batch1.json` / `-batch2.json` (Test A). It makes no new Qloo or Gemini calls.

**Disclosure:** this was written on 29 Oct 2026. Tests A and B had already been published (Test A: LLM beat winnability, p=0.031; Test B: Qloo beat popularity, p<0.001, and trailed Gemini, not significant). Each arm's per-case rankings existed on disk, but nobody had computed a fused ranking or any fused score before this amendment was committed. Tests A and B stay exactly as published.

### 7.1 Primary: fusion vs Gemini
- **Fusion rule (fixed; no alternatives will be tried):** reciprocal rank fusion with k = 60 (Cormack, Clarke & Büttcher, SIGIR 2009). This is the standard parameter-free rule for merging two rankings. Each candidate scores `1/(60 + rank_Gemini) + 1/(60 + rank_Qloo)`, with ranks starting at 1. Candidates are sorted by score, descending, and ties are broken by Gemini rank.
- **Test B:** the 22 reviewed cases. The inputs are the `gemini` and `qloo_rank` arms' `ranking` (10 candidates each). The fused list is scored exactly as Test B scores an arm: reciprocal rank of the real pick, then the mean over cases. A paired sign test compares fusion with Gemini: two-sided exact, ties dropped.
- **Test A:** every artist in batches 1 and 2. The inputs are the `llm` and `winnability` arms' `ranking` over the artist's candidates. The fused list is scored exactly as Test A scores an arm: R-precision against the played cities. A paired sign test compares fusion with the LLM, using the same rules.
- **Missing arms:** a case or artist where either input arm's status is not ok (no answer, error, or a non-permutation after the retry) is excluded from that test's fusion analysis. Exclusions are listed with their reason.
- **Claim rule (unchanged):** a win is claimed only if fusion's mean is higher, fusion has more wins than losses, and p < 0.05. Otherwise the difference is reported as not significant at this sample size, under "what we learned". A loss or tie is stated plainly.
- **Also reported, descriptively, with no test:** fusion's mean beside every existing arm.

### 7.2 Exploratory: tours after the model's training cutoff
- **Rule:** keep only the cases the Gemini model that answered them could not have seen. That model is recorded per case as `geminiModel` (Test B) or `llmModel` (Test A). Cutoffs, as Google states them:
  - `gemini-2.5-flash`: January 2025 (Gemini API model page, <https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash>).
  - `gemini-3.8-flash`: March 2026, with a note that some domains are limited to January 2025 (Google DeepMind model card, <https://deepmind.google/models/model-cards/gemini-3-8-flash/>). The stated date, March 2026, is used.
  - Any other or unknown model: the case is excluded, and we say so.
- **Test B:** keep a case if its tour date (YYYY-MM) is strictly after the cutoff month.
- **Test A:** keep an artist if `firstShowYear` is strictly greater than the cutoff year. Only the year is stored, so this rule errs towards excluding. Test A's pool is drawn from the 2023 and 2024 concert-tour categories, so this subset may well be empty. If so, it is reported as empty.
- **Re-scoring:** every arm and the fusion are re-scored on the subset with the same metrics. The subset is labelled "exploratory, small n". Nothing is claimed unless the subset meets the claim rule above, and even then it is reported as exploratory.

### 7.3 Publication
- A script computes both parts from the stored files and writes the results into `backtest.json` (`proofV3.fusion`).
- The README proof section and `/proof` publish whatever comes out.
- If fusion meets the claim rule on Test B, the line reads: "Gemini + Qloo ranked the real tour's pick better than Gemini alone (…)". If not, the result is stated plainly. Tests A and B keep their published wording.

## Amendment 8: Test C rater change, AI-assisted rating with human cross-check (2026-10-30, before any Test C score was computed)
**What happened:** the reviewer (Prateek) rated 34 of the 182 blinded rows before stopping; rating all rows by hand was not feasible before the deadline. No Test C score, share or sign test had been computed, and nobody had opened `proof-v3-ground-key.json`, when this amendment was written.

**Change (rater only; arms, rows, definitions, metric and claim rule are unchanged):**
- **AI raters, blinded.** Claude Sonnet agents rated all 182 rows from a copy of the sheet's visible fields only (row id, category, city, country, name), using the Amendment 5 definitions verbatim. They were told not to open the key or items files and had no arm information.
  - **Pass 1:** all 182 rows, in 4 batches. Each rating has a source URL and a confidence level. Most pass-1 ratings drew on the model's own knowledge with a cited source, not on a fetched page.
  - **Pass 2, evidence-required:** every Local act row (50) plus every pass-1 row that was not "in this city, high confidence" (11): 61 rows. Each rating had to rest on a page fetched in that run, with a supporting quote; otherwise "Can't tell". Where the passes disagree, pass 2 is used.
  - Two pass-2 outputs contradicted their own quoted evidence (r094, r181) and were corrected to match the quote before scoring.
- **Human cross-check.** On the 34 rows rated by both, the human and the final AI rating agreed on 28 (82%). All 6 disagreements were reviewed by the reviewer against the fetched evidence, and the reviewer's final decision is recorded (row ids only, because names are Qloo data): r005 → Can't tell, r007 → Exists in this city, r008 → Exists in another city, r019 → Exists in another city, r033 → Can't tell, r034 → Exists in this city. Three pass-2 judgement calls were settled by the reviewer under the "based in or from" definition: r030 → in this city, r081 → in this city, r094 → in another city.
- **Primary result:** the reviewer's rating wherever the reviewer rated a row (after adjudication), the final AI rating elsewhere.
- **Also reported:** the result using AI ratings only, and the agreement figure above.

**Disclosure:** 148 of 182 rows were rated by an AI model, not a person. An AI rater may share blind spots with the LLM-only arm it is judging. Brands and venues rated "in this city, high confidence" in pass 1 (121 rows) were not re-checked against a fetched page. Rows stay private (Qloo-returned names are Qloo data); only aggregates are published.

## Amendment 9: Test B on cases after the model's training cutoff (2026-10-30, before any case for it was collected)
**Why:** every head-to-head so far used tours from 2023–2025 that Gemini may have read about. Amendment 7.2 found 4 such post-cutoff Test B cases (Qloo 0.44, Gemini 0.31, not significant). This amendment collects a new, larger set of cases that the answering model cannot have seen, and reruns Test B on them unchanged. Decided by Prateek.

**Cases (fixed rule, collected after this commit):**
- **Eligible:** an activation between a headlining music artist and a city, with the same three types as Test B: `local_artist` (an act from or based in the city who performed with the headliner, as opener or on-stage guest), `sponsor` (a brand named as the show's or tour stop's sponsor or presale partner) and `merch_collab` (a city-specific merch collaboration).
- **Date:** the show or activation date is on or after 2026-04-01 and on or before 2026-10-29. Both answering models' stated cutoffs (gemini-3.8-flash March 2026; gemini-2.5-flash January 2025) fall before this window.
- **Evidence:** at least one source page fetched and read during collection that names the headliner, the city and the real pick, and gives the date. Search snippets do not count.
- **Search procedure:** Sonnet agents search news, Songkick/setlist.fm and official announcements with a fixed query list (one query set per type, recorded in `backtest/cases-post-cutoff.queries.md`). Every candidate found is logged with its outcome (accepted, or rejected with the reason), so no case is dropped silently.
- **Verification:** a second agent, without access to any ranking, re-fetches each accepted case's source and confirms headliner, city, real pick and date. Cases it cannot confirm are excluded and listed.
- **Collection closes** at 2026-10-31 01:30 IST or at 40 accepted cases, whichever comes first. Whatever count exists then is the sample; no case is added after any Test B call is made.
- **No human review** this time (time limit): disclosed with the results.

**Run:** exactly Test B (`fixedRankCli` with `--cases backtest/cases-post-cutoff.json`), same candidates rule (real pick plus 9 decoys from the city popularity list by `sha256(case id + decoy name)`), same arms (Qloo `rank`, Gemini fixed prompt at temperature 0.2, popularity order), same metric (mean reciprocal rank) and the same claim rule (higher mean, more wins than losses, two-sided exact sign test p < 0.05). A case whose real pick can't be resolved in Qloo, or with fewer than 9 decoys, is reported and excluded as in Test B. The answering Gemini model is recorded per case; a case answered by a model whose stated cutoff is not before the case date is excluded.

**Secondary (reported, not claimed unless it meets the claim rule):** Gemini + Qloo by reciprocal rank fusion (k = 60, Amendment 7.1) vs Gemini; Qloo vs popularity.

**Publication:** whatever comes out goes on `/proof` and in the README, with the case count, the exclusions and the disclosures above. If the sample is too small for any claim, it is reported as "not significant at this sample size".

**Budget:** about 40 popularity lists, 40 resolves and 40 rank calls (≈ 120 Qloo calls, partly cached) and up to 80 Gemini calls.

## Amendment 10: catch rates for the product's other checkers (2026-10-30, before any of these was run)
**Why:** `/proof` publishes one checker test (the claim checker, "Claim-checker catch rate"). The product has four more checks that stop a wrong number or name reaching the user. This amendment tests each with planted errors and clean controls, written down here before any runner exists and before any number is computed. These are checks, not comparisons: no significance test, no arms. Everything is offline: no Qloo call, no Gemini call, no network.

**Reported per checker, in the same wording as the claim checker:** "caught N of 20, false alarms M of 20". Caught = the checker flagged or removed the planted item. A false alarm = it flagged or removed a clean control. Every generator below is fixed and deterministic (an index `i` and the formulas written here; no random numbers, no seed beyond `i`), so anyone can regenerate the same 40 cases per checker. Each generator's test asserts the construction rule (for example "this number is on no tool result"), so a plant that is not actually wrong would fail the test, not inflate the rate. Plants that the checker misses are reported as misses; the cases are not changed after any run.

**Output:** `src/backtest/checkerCatch.ts` and `checkerCatchCli.ts` (`node dist/backtest/checkerCatchCli.js [--out private-data/backtest/proof-v3-checkers.json]`) write every case with its text, whether it is planted, and whether it was flagged. The results are published as `proofV3.checkers` next to the claim-checker catch rate. Case texts contain no Qloo data and are fixtures, but the file stays under `private-data/` like the other outputs.

### 10.a Strategist answer check
- **Code under test:** `unsupportedNumbers(answer, toolData, context)` in `src/strategist/answerCheck.ts`. An answer is flagged when it returns a non-empty list. `context` is `{}`.
- **Fixed tool results** (`toolData`, one array, `k` = 0..19): `{audience: 1000+53k}`; `{lon: -(70+3.17k)}` rounded to 2 decimals; `{sharedTaste: 0.50+0.01k}` (2 decimals); `{share: 0.30+0.01k}` (2 decimals); `{query: {age: {band: -(0.10+0.01k)}}}` (2 decimals; negative, an under-index).
- **Plants (20), each a one-sentence answer:**
  - 8 absent numbers, `k` = 0..7: "Attendance reached {1007+53k}." (en-US thousands separators). 1007+53k is never 1000+53j.
  - 4 absent absolute values, `k` = 0..3: "The venue sits near {|lon_k|+5.11} west." (2 decimals; neither the value nor its absolute value is in the results).
  - 4 wrong-sign scores, `k` = 0..3: "The age band indexes at +{0.10+0.01k} above average." (the result is the negative value; its positive spelling is not supported).
  - 4 percent-restated demographic indexes, `k` = 4..7: "About {round(100*(0.10+0.01k))}% of the audience is in that band."
- **Controls (20), none may be flagged:**
  - 8 present numbers, `k` = 0..7: "Attendance reached {1000+53k}."
  - 6 sign-dropped coordinates, `k` = 0..5: "The venue sits near {|lon_k|} west." (2 decimals).
  - 3 plain score values, `k` = 0..2: "Shared taste is {0.50+0.01k}."
  - 3 percent of a non-score value, `k` = 0..2: "{round(100*(0.30+0.01k))}% of ticket buyers used the presale."

### 10.b Document citation check
- **Code under test:** the same function with its documents argument, `unsupportedNumbers(answer, toolData, {}, documents)`, which checks a sentence ending in `[doc:id p.n]` only against the numbers on that page. This path lives on branch `feat/doc-context` (commit `8498287`, "answer check verifies document citations against the cited page only"); that branch is merged into the test branch before the runner is written, with no change to the check.
- **Fixed document** `{id: "rec", name: "recap.txt"}`, pages `n` = 1..10, page text: "Show {n} sold {300+41n} tickets. Gross was {5000+730n}." (en-US thousands separators). Fixed tool results for 10.b.3: `[{fit: 7000+113k}]` for `k` = 0..5.
- **Plants (20):**
  - 7 numbers cited to a page that does not contain them, `k` = 1..7: "That date drew {300+41k+9} tickets [doc:rec p.{k}]." (the number is on no page).
  - 7 numbers cited to the wrong page, `m` = 1..7: "That date drew {300+41m} tickets [doc:rec p.{m+1}]." (the number is on page m, cited to page m+1).
  - 6 doc citations on a tool-only number, `k` = 0..5: "The fit was {7000+113k} [doc:rec p.1]." (in the tool results, on no page).
- **Controls (20), none may be flagged:** 10 with `n` = 1..10: "That date drew {300+41n} tickets [doc:rec p.n]."; 10 with `n` = 1..10: "Gross was {5000+730n} [doc:rec p.n]."

### 10.c Advance source and number filter
- **Code under test:** `resultAboutCountry` and `verifyAdvance` in `src/web/advance.ts`. For each case, `verifyAdvance({items:[item]}, results, destination)` is run with `results` holding the item's source plus one correct-country result for the same destination. An item is caught when it is in `removed` (not in `items`).
- **Plants (20):**
  - **10 other-country sources** (fixed list; destination in brackets; each result is `{title, url, content}`; the item's text is the first sentence of its content, so its numbers are in its own source and only the country filter can catch it). The first five name only the other country anywhere; the last five name the other country in the title and the destination only in the body.
    1. [US] "Canada work permits for visiting musicians" / https://example.test/ca/work-permits / "Foreign performers in Canada may need a work permit; the fee is 155 dollars and processing takes 14 days."
    2. [US] "UK Permitted Paid Engagement for touring artists" / https://example.test/uk/ppe / "Visitors to the UK can perform for up to 30 days with a Permitted Paid Engagement."
    3. [MX] "Spain visa for non-EU musicians" / https://example.test/es/visa / "Artists entering Spain apply at the consulate and processing takes 21 days."
    4. [MX] "France ATA Carnet customs for instruments" / https://example.test/fr/carnet / "Customs in France accept an ATA Carnet valid for 12 months."
    5. [BR] "Portugal visa for performing artists" / https://example.test/pt/visa / "Portugal issues a temporary stay visa for artists with a fee of 90 euros."
    6. [US] "Japan entry rules for foreign bands" / https://example.test/jp/bands / "Japan requires a Certificate of Eligibility and processing takes 30 days. Unlike the United States, there is no O-1 category."
    7. [US] "Germany artist visa guide" / https://example.test/de/artists / "Germany's freelance visa takes 40 days. It differs from the United States P-1 visa."
    8. [MX] "Colombia customs rules for instruments" / https://example.test/co/customs / "Colombia accepts an ATA Carnet for 6 months. Mexico also accepts it."
    9. [BR] "Argentina touring visa" / https://example.test/ar/visa / "Argentina grants a touring visa in 25 days. Brazil requires a different visa."
    10. [BR] "Chile work visa for artists" / https://example.test/cl/visa / "Chile processes artist visas in 20 days. Brazil takes 45 days."
  - **10 numbers absent from their own source.** The clean source for `i` = 0..19 is `{title: "{Name} work visa processing for touring musicians", url: "https://example.test/{code}/{i}", content: "Processing takes {10+3i} business days and the fee is {150+25i} dollars in {Name}."}` with destination `[US, MX, BR][i mod 3]` (`Name` = United States, Mexico, Brazil; `code` = us, mx, br). Plants use `i` = 0..9: for `i` = 0..4 (number on no source) the item is "The fee is {150+25i+4} dollars." citing source `i`; for `i` = 5..9 (a number from another source) the item is "Allow {10+3(i+1)} business days." citing source `i`.
- **Controls (20), none may be removed:** for `i` = 0..19, the item "Allow {10+3i} business days and a fee of {150+25i} dollars." citing source `i`.

### 10.d Sponsor check
- **Code under test:** the sponsor path of `src/pipeline/sponsorSegments.ts`, applied to one list of items `{entityId, name}`: first `dropNonSponsors` (`src/pipeline/nonSponsors.ts`, names and endings), then `keepVerified(items, verdicts)` (`src/pipeline/sponsorCheck.ts`) with a fixed fake classifier answer. An item is removed when it is not in the output.
- **What this measures:** the rule, given classifier outputs. It does not measure the live model: no model is called, and how often the real classifier answers wrongly or not at all is not measured here. The wrong and missing answers below are made up to exercise the fallback rule.
- **Plants (20 organisations, ids p01..p20, in this order):** Planned Parenthood, ACLU, Greenpeace, Sierra Club, NAACP, Red Cross, Feeding America, Salvation Army (on the name list); Robin Hood Foundation, Wikimedia Foundation, Libertarian Party, Hillsong Church (generic ending); Everytown for Gun Safety, Focus on the Family, Oxfam, Americans for Prosperity, Mercy Corps, Charity: Water, Heritage Action, Moms Demand Action (neither).
- **Controls (20 consumer brands, ids c01..c20):** Nike, Coca-Cola, Spotify, Red Bull, Adidas, Samsung, Levi's, Pepsi, Toyota, Heineken, Jack Daniel's, Ticketmaster, Uber, Airbnb, Sony, Converse, Absolut Vodka, Doritos, Fender, Budweiser.
- **Lists:** four lists of 10 (list `j` = 0..3: plants `5j+1..5j+5` and controls `5j+1..5j+5`, alternating control, plant), checked one list at a time.
- **Fixed classifier table (`sponsor` verdict by id), main condition (call succeeded, so `available = true`):**
  - plants: p01 to p12 (all on the list or ending rule): "no" for p01, p02, p04, p05, p06, p07, p08, p09 and "yes" (wrong) for p03, p10, p11, p12. p13 to p16 "no". p17 and p18 no answer (missing). p19 and p20 "yes" (wrong).
  - controls: "yes" for all except c10 (Heineken) and c12 (Ticketmaster), which are answered "no" (wrong), and c18 (Doritos), which has no answer (missing).
- **Secondary condition (the check failed, `available = false`, no cached verdicts):** the same lists with an empty verdict map, reported separately, to show what the name rule alone catches.
- **Headline:** the main condition, "caught N of 20, false alarms M of 20".

### Scope and publication
- **No retuning:** the checkers are not changed after these cases are written; a miss or a false alarm is a result, not a bug to hide. Fixes to a checker come after the run and are described as fixes.
- **Publication:** `/proof` shows one row per checker (what it guards, planted errors caught, false alarms on clean controls) under "Verified claims, across the product", and the README quotes the same table. Each row states that the planted errors are synthetic and fixed, that the four fixtures are small, and (10.d) that the live classifier is not tested.
