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
