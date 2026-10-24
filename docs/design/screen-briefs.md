# Screen briefs: Tour Intelligence × Qloo

Input for the Stitch prompts (spec §11.0 step 2). Every prompt starts with the **Stitch prompt preamble** in `docs/design/DESIGN.md` §10.1, then one brief below. Tokens, components and bans come from DESIGN.md. Do not restate them here differently.

Screens: Landing · Tour Board · City Playbook · Taste Insights · Tour & Activation Book reader. Each has a 375 px and a 1280 px brief.

---

## 0. Shared showcase dataset (use verbatim across all screens)

**Artist:** Lumen Vale. Dream-pop / indie electronic act, mid-tier, first Latin America run.
**Brief:** regions Mexico, Brazil, US · window 12 Mar – 18 Apr 2027 · capacity tier 1,000–2,500 · max stops 8.
**Momentum (qloo_trends, 90 days):** rising, +18%.
**Defining tags (entity_tags, affinity):** dream pop 0.94 · synthwave 0.88 · bedroom pop 0.83 · shoegaze 0.77 · neo-psychedelia 0.71 · city pop 0.66.
**Agent run:** 47 Qloo calls (31 from cache), 2 partial results, 1 empty result.

### Scored markets (verdicts follow spec §5.3 exactly; winnability = 0.5 × heat + 0.5 × activation)
| Winnability rank | City | Code | Fan heat | Activation | Winnability | Verdict | Density-only rank | City slot (DESIGN §2.6) |
|---|---|---|---|---|---|---|---|---|
| 1 | Mexico City | MX | 91 | 77 | 84 | Play | 1 | 1 `#ff3d00` |
| 2 | São Paulo | BR | 84 | 66 | 75 | Play | 3 | 4 `#009e5c` |
| 3 | Guadalajara | MX | 62 | 82 | 72 | **Hidden goldmine** | 6 | 3 `#ff00aa` |
| 4 | Curitiba | BR | 51 | 77 | 64 | **Hidden goldmine** | 9 | 7 `#00a0b0` |
| 5 | Los Angeles | US | 88 | 40 | 64 | De-risk | 2 | 2 `#0091ea` |
| 6 | Rio de Janeiro | BR | 72 | 54 | 63 | Consider | 4 | 6 `#c27c00` |
| 7 | Austin | US | 66 | 52 | 59 | Consider | 5 | 8 `#a39200` |
| 8 | Monterrey | MX | 57 | 59 | 58 | Consider | 7 | 5 `#7c4dff` |
| 9 | Chicago | US | 47 | 49 | 48 | Skip | 10 | neutral |
| – | Belo Horizonte | BR | 55 | — | — | Not enough data (1 of 4 inputs) | 8 | neutral |

Curitiba and Los Angeles tie at 64; tie broken by activation. The story: **Density-only puts Guadalajara 6th and Curitiba 9th; Winnability moves them to 3rd and 4th.** Los Angeles has the fans but almost nothing to activate.

### Agent log lines (rendered from real events; sample)
1. Resolved "Lumen Vale" → artist, 1 match · `qloo_describe · 0.6 s`
2. Finding where Lumen Vale's fans concentrate in Mexico… 9 hotspots → 3 cities · `qloo_where_popular · 1.4 s`
3. Finding where Lumen Vale's fans concentrate in Brazil… 14 hotspots → 4 cities · `qloo_where_popular · 1.8 s`
4. Finding where Lumen Vale's fans concentrate in the US… 11 hotspots → 3 cities · `qloo_where_popular · 1.6 s` · From cache
5. Reading the fan base… 6 age bands, 6 defining tags · `qloo_audience_demographics, qloo_entity_tags · 1.1 s`
6. Checking momentum… rising, +18% in 90 days · `qloo_trends · 0.9 s`
7. Checking sponsor fit in Guadalajara… 10 brands, top fit 0.91 · `qloo_recommend · brand · 1.3 s`
8. Ranking 7 venues in Guadalajara… top: C3 Stage, 0.91 · `qloo_rank · place · 1.2 s`
9. Belo Horizonte: 1 of 4 activation inputs returned → not enough data · `qloo_where_popular · empty`
10. Scored 9 cities · 2 Play · 2 Hidden goldmine · 1 De-risk · 3 Consider · 1 Skip

### Guadalajara playbook (the judge-path city)
Activation 82 = 100 × (0.30 × sponsor 0.84 + 0.25 × local hooks 0.79 + 0.25 × fan concentration 0.81 + 0.20 × venue fit 0.86).

- **Sponsors** (mean top-5 fit 0.84): Cerro Alto Mezcal 0.91 · Brisa Vinyl Bar 0.87 · Ola Norte Surf Supply 0.83 · Casa Jícara Coffee 0.81 · Tejido Studio (apparel) 0.78.
- **Merch localisation:** "Jacaranda season" drop, lilac + bone two-colour screen print, papel-picado line motif, heavyweight boxy tee and a tote; city-exclusive, 300 units.
- **Promo zones** (top 3 hold 81% of in-city heat): Colonia Americana 38% · Chapultepec 26% · Providencia 17% · Zapopan Centro 9% · Tlaquepaque 6%.
- **Local moment:** fans here also love Bruma Nocturna (local artist, 0.88), late screenings at Cine Foro, Mercado San Juan de Dios food stalls. Stage nod: cover one Bruma Nocturna song; say "Gracias, tapatíos".
- **Venue fit** (qloo_rank, 7 options): C3 Stage 0.91 · Teatro Diana 0.86 · Foro Independencia 0.79.
- **Co-billing** (lift = overlap × local affinity): Bruma Nocturna 0.34 × 0.88 = 0.30 · Sala Cóndor 0.29 × 0.81 = 0.23 · Hilo Rojo 0.22 × 0.74 = 0.16.
- **This week in the city** (Parallel, cited): film festival week 13–19 Mar (2 sources) · long weekend around 15 Mar (Benito Juárez holiday observed 15 Mar 2027) · no rival 1,000–2,500 cap show on 14 Mar (1 source).
- **Grounding:** 7 verified · 2 removed. Removed: "Number 0.93 not in evidence (nearest 0.91)"; "Entity 'Foro Alameda' not in any referenced result".

Brand, local-artist and coffee/mezcal/vinyl-bar names are **fictional sample data**; neighbourhoods and venues are real Guadalajara places with sample scores. Replace with live Qloo output before launch.

---

## 1. Landing

**Purpose:** in one screen, say what this is and start the judge path. "Where can this artist win, and exactly how?" Then one tap into the pre-cached showcase.

### 1a. Landing · 375 px
**Content blocks, in priority order**
1. Top row (56 px): wordmark "Tour Intelligence" (Fraunces 18/600) + "× Qloo" (Inter 13 stone); right, text link "Proof".
2. Headline `display-hero` 48 px, two authored lines: "Win / their city." Left-aligned at the 16 px margin.
3. Supporting line, Inter 17/1.45 stone, max 3 lines: "Find the cities where your artist can win, then get the sponsor, venue and promo plan for each one. Built on Qloo taste data."
4. **Real interface fragment** (not a fake dashboard): one Tour Board routing row for Guadalajara, MX, at full width: Fan heat 62, Activation 82, winnability 72, solid gold "Hidden goldmine" chip. Under it in 13 px stone: "Ranked 6th on fan density alone. 3rd on winnability."
5. Primary CTA in the thumb zone, full width, 52 px: **Try the showcase tour** (gold). Below it a secondary tonal button (#32312a), same height: **Plan your own**.
6. Foot line, 13 px stone: "Affinity signal from aggregate taste data — not a ticket forecast." and the link "See the backtest".

**Interactions:** tapping the Guadalajara row goes straight to its City Playbook in the showcase. "Plan your own" opens the brief form (artist, regions, window, capacity tier, max stops) as a full-height sheet.

**Signature moment:** on load, the Guadalajara row's two bars fill (heat first, activation 120 ms later), then the verdict chip stamps in as "Hidden goldmine" with its single gold flash. The page's only animation. Reduced motion: final state, no stamp.

**Rule break:** the only full-bleed element is the routing row fragment, which runs edge to edge (0 px margin) while everything else holds the 16 px margin.

### 1b. Landing · 1280 px
**Layout:** 12-col. Left columns 1–5: wordmark row, headline 88 px ("Win / their city."), supporting line (max 44ch), CTAs side by side (gold **Try the showcase tour**, tonal **Plan your own**), integrity line. Right columns 6–12: **animated heat preview**, a real MapLibre fragment of Mexico + southern US + Brazil (cropped as a tall 7:8 panel, radius 18 px) with bone heat hexbins and verdict markers for the 9 showcase cities; Guadalajara and Curitiba labelled.
**Content priority:** headline → map preview → CTA → routing-row fragment for Guadalajara docked at the bottom-left of the map panel, overlapping nothing (it sits in its own band below the map on a 24 px gap) → integrity line → top-bar links (Discover, Tours, Insights, Proof).
**Interactions:** hovering a map marker shows its row (city, two bars, verdict); clicking opens the Playbook in the showcase. The map is non-interactive for pan/zoom here (preview only).
**Signature moment:** the heat preview "lights up": hexbins fade from the lowest ramp step to their true values region by region (Mexico, then US, then Brazil, 400 ms apart), mirroring the agent's real order; then Guadalajara's diamond marker gets its selection ring. Plays once.

---

## 2. Tour Board ★

**Purpose:** the routing board. Rank the candidate markets by winnability, show *why* at a glance (two bars + verdict), and make the comparison with density-only routing undeniable.

### 2a. Tour Board · 375 px
**Content blocks, in priority order**
1. Header strip on canvas (52 px): back chevron, title "Lumen Vale" (Inter 17/600) with "Mexico · Brazil · US" 13 px stone under it; right, the **Agent chip** "Agent · 47 Qloo calls".
2. **Map**, top ~45% of the viewport: re-tinted dark CARTO, bone heat hexbins over Mexico, Brazil and the US, verdict-shaped markers for 9 cities; Belo Horizonte as a hollow square.
3. **Bottom sheet** (snap 55% by default) with grabber, then:
   - Segmented control, full width: **Winnability** (selected) · Density-only · Without Qloo.
   - One-line summary, 13 px stone: "9 markets scored · 2 Play · 2 Hidden goldmine · 1 De-risk".
   - **Routing rows** in winnability order (DESIGN §4.6): Mexico City 84 Play; São Paulo 75 Play; Guadalajara 72 Hidden goldmine; Curitiba 64 Hidden goldmine; Los Angeles 64 De-risk; Rio de Janeiro 63 Consider; Austin 59 Consider; Monterrey 58 Consider; Chicago 48 Skip; Belo Horizonte "Not enough data, 1 of 4 inputs".
   - Each row: rank number in mono 13 stone at left (position, not decoration), city name Inter 17/600, country code, two bars with values, verdict chip, winnability `kpi` number right.
4. Sticky footer inside the sheet: gold **Build tour** (disabled until ≥ 1 city is shortlisted; rows get a 44 px "Add" toggle at far right when the sheet is at 92%), plus text action "Why this score?".
5. Bottom tab bar: Discover · **Tours** (active) · Strategist; Strategist FAB above it.

**Interactions:**
- Tap row → City Playbook. Tap marker → sheet scrolls that row into view and highlights it (#32312a).
- Segmented toggle re-ranks with FLIP: Density-only orders by fan heat (Mexico City, Los Angeles, São Paulo, Rio de Janeiro, Austin, Guadalajara, Monterrey, Belo Horizonte, Curitiba, Chicago); Activation bars dim to 30% so heat leads. "Without Qloo" hides both bars and verdicts and shows a stone notice: "No taste data. This is the ranking you'd get without Qloo."
- Agent chip → agent log sheet (92%) with the 10 log lines.
- "Why this score?" → sheet with formula, weights, Guadalajara's component values and request hashes.
- Map owns one-finger pan; sheet owns vertical scroll.

**Signature moment:** switching Density-only → Winnability. Guadalajara climbs from 6th to 3rd and Curitiba from 9th to 4th, while Los Angeles drops from 2nd to 5th, rows sliding past each other with springs; the two Hidden goldmine chips stamp in as they land. Colours never change during the move.

**States:** while the agent runs, rows appear in the order cities are scored (skeleton rows for the rest); Brazil arriving late shows "Waiting on Brazil… 2 of 3 regions" in the summary line; a cached run shows "From cache · 2 h ago" beside the agent chip.

### 2b. Tour Board · 1280 px
**Layout:** top bar (56 px). Below it a 12-col split: **map in columns 1–7** (full height minus top bar, radius 0, edge to edge at the left), **routing list in columns 8–12** on #26251f. Agent log as a 360 px right side panel that pushes the list (not an overlay) when open; open by default during a live run, collapsed to the chip when done.
**Content priority:**
1. List header: "Tour Board" `display` 40 px Fraunces; under it "Lumen Vale · Mexico, Brazil, US · 12 Mar – 18 Apr 2027 · 1,000–2,500 cap" in 13 px stone; segmented control; agent chip.
2. Routing rows at 72 px (bars to the right of the name on one line): all 10 visible without scrolling at 800 px height.
3. **Comparison side-by-side** (spec): a "Compare" toggle splits the list into two narrow columns, *Density-only* and *Winnability*, with thin connector lines between each city's two positions (Guadalajara's line rises 6 → 3 in gold; others in stone).
4. Footer bar: shortlist count "4 markets shortlisted", gold **Build tour**, link "Taste Insights".
**Interactions:** hover row highlights its marker and vice versa; selecting a row opens a 400 px right drawer preview (city header, verdict, two bars, top sponsor, top venue, top promo zone, "Open playbook"); keyboard ↑/↓ moves through rows, Enter opens the playbook.
**Signature moment:** Compare view's connector lines draw from left to right (400 ms, ease-in-out) once, revealing the two Hidden goldmines' climbs.

---

## 3. City Playbook ★

**Purpose:** the activation plan for one city: who sponsors, what merch, where to poster, what local nod, which room, who opens, what's on that week. Every claim grounded.

### 3a. City Playbook · 375 px (Guadalajara)
**Content blocks, in priority order**
1. **Key-art header** (4:5 poster, full width, 0 radius at top): Guadalajara gig poster, fuchsia `#ff00aa` + bone risograph on canvas, jacaranda-blossom motif, "GUADALAJARA" hand-lettered. Back chevron and Share icon on a canvas-tinted 40 px square in the top corners.
2. Identity block below the art (not on it): city name `title` 24 px Fraunces "Guadalajara"; "Jalisco, MX" 13 px stone; solid gold **Hidden goldmine** chip (28 px); winnability `kpi` "72" with "/100"; two bars (Fan heat 62, Activation 82); text action "Why this score?".
3. Advance-sheet strip (2 × 2 key–value grid on #26251f): `TOP ZONE` Colonia Americana · `BEST ROOM` C3 Stage · `SUPPORT` Bruma Nocturna · `CLAIMS` 7 verified · 2 removed.
4. **Sticky tabs**: How to win (active) · Local acts.
5. **Swipeable CueCards** (horizontal snap, 88% width, next card peeking 24 px), each with the fuchsia perforated rail and mono meta line:
   - Sponsors `GDL · SPONSORS · 10 BRANDS`: 5 ranked brands with fit right-aligned.
   - Merch `GDL · MERCH`: "Jacaranda season" drop description + 2 colour swatches (lilac, bone).
   - Promo zones `GDL · PROMO ZONES`: mini hex heat map of the city + 5-row table (zone, share).
   - Local moment, Venue fit, Co-billing (lift shown as `0.34 × 0.88 = 0.30`), This week (each item with a source chip).
   - Each card foot: "7 verified · 2 removed" badge (per card counts) and source chip "Qloo · 2 requests".
6. Collapsible "Model reasoning summary" under the card stack, then tool chips.
7. Sticky bottom action above the tab bar: gold **Add to tour**.

**Interactions:** swipe cards; card-dot progress indicator is replaced by a text counter "Sponsors · 1 of 7" (no dots). Tap badge → audit sheet listing the 2 removed claims with reasons. Tap any number → its inputs. "Why this score?" → bottom sheet with the activation formula filled with Guadalajara's values.

**Signature moment:** the key-art "print pull": the poster reveals in two passes like a two-colour screen print (fuchsia layer, then bone layer, 300 ms apart, clip-path wipe top to bottom). Reduced motion: shows the finished poster.

**States:** a card whose claims were all removed shows evidence-only content (the ranked list) with "Narrative removed: no claim passed verification." Curitiba's playbook shows Promo zones as the empty hex grid with "Qloo returned no neighbourhood data for Curitiba".

### 3b. City Playbook · 1280 px
**Layout:** header band in 12 cols: identity block cols 1–5 (city name 40 px Fraunces, chip, winnability, bars, advance-sheet grid 2 × 2, Add to tour + Why this score?), key art cols 6–12 as a 16:9 crop (radius 18 px). Sticky tabs below the band. **Card grid** (spec): asymmetric, not equal thirds: Sponsors (cols 1–5, tall) beside Promo zones (cols 6–12, with a real in-city map 7:4, zones table under it); next row Venue fit (cols 1–4) · Co-billing (cols 5–8) · Local moment (cols 9–12); next row Merch (cols 1–7, with swatches and a flat mock of the tee print) · This week (cols 8–12, a dated list with sources).
**Content priority:** identity + verdict → Promo zones map → Sponsors → Venue fit → Co-billing → Local moment → Merch → This week → reasoning summary.
**Interactions:** "Why this score?" opens a 400 px right drawer; hovering a zone row highlights its hexes on the in-city map; Strategist docked panel available at right ("Ask about Guadalajara").
**Signature moment:** the same two-pass print pull on the 16:9 key art, then the Promo zones map's three top zones light up in heat order (Colonia Americana, Chapultepec, Providencia).

---

## 4. Taste Insights

**Purpose:** the evidence room for promoters and judges: every number on the board, explorable and filterable, built only from data already fetched. Density 8.

### 4a. Taste Insights · 375 px
**Content blocks, in priority order**
1. Header: "Taste Insights" `display` 32 px; "Lumen Vale · 9 markets" 13 px stone; right, **Filters** button (secondary, shows count badge "2").
2. Data quality strip, horizontally scrollable StatTiles (each 148 px): `QLOO CALLS` 47 · `FROM CACHE` 31 · `PARTIAL` 2 · `EMPTY` 1 · `CLAIMS` 41 verified / 6 removed.
3. **Winnability matrix** (full width, 1:1): scatter, x = Fan heat 0–100, y = Activation 0–100, verdict quadrants shaded at 6% of their verdict mark colour (Play region heat ≥ 70 & act ≥ 60; Hidden goldmine region heat 45–70 & act ≥ 75; De-risk heat ≥ 70 & act < 45). Markers by verdict shape; direct labels for Guadalajara, Curitiba, Los Angeles, Mexico City. Source chip + "Table" toggle.
4. **Activation breakdown** as a boxscore table (not stacked bars): rows = 8 scored cities, columns = Sponsor (w 0.30) · Hooks (0.25) · Concentration (0.25) · Venue (0.20) · Activation; each cell a value plus an in-cell 4 px bone bar. Guadalajara row: 0.84 · 0.79 · 0.81 · 0.86 · 82. Sticky city column.
5. **Audience profile**: diverging bars by age band (over-index right in bone, under-index left in `#736e60`, zero line stone): ≤24 +0.41 · 25–29 +0.22 · 30–34 +0.05 · 35–44 −0.18 · 45–54 −0.36 · 55+ −0.52; tags as a ranked list with affinity (not a word cloud on phone).
6. **Momentum**: line chart, 90 days, Lumen Vale in gold (+18%), comparison artists in stone steps with direct labels: Kite Theory +11%, Saltwater Hymns +4%, Neón Ritual −6% (fictional).
7. **Cross-domain taste** for the selected city (default Guadalajara): ranked bars per type, segmented by Brands · Venues · Artists · Film/TV.
8. **Promo zones** for the selected city: in-city hex map + table.
9. Artist vs artist overlap: two-bar overlap view "Lumen Vale ∩ Kite Theory: 31% shared audience".

**Interactions:** Filters open a bottom sheet (artist up to 3 · region · city · entity type · min affinity slider · verdict multi-select · live vs cached · trend window). Tapping a scatter marker opens a mini-sheet for that city with "Open playbook". Every panel's source chip opens the Qloo requests behind it.

**Signature moment:** filtering by verdict **Hidden goldmine**: every other marker fades to 20%, the two diamonds (Guadalajara, Curitiba) scale up and their labels slide out, and the boxscore table collapses to those two rows. One filter, every panel answers.

**States:** Belo Horizonte appears in the matrix as a hollow square pinned to the x-axis at heat 55 with "Activation not returned"; panels with zero rows after filtering show the empty chart frame with "No markets match these filters" and "Clear filters".

### 4b. Taste Insights · 1280 px
**Layout:** filter rail cols 1–3 (always visible, 32 px rows, verdict filters as icon + label checkboxes); panels cols 4–12 in an asymmetric grid: KPI strip (5 tiles in one row) → Winnability matrix (cols 4–9, 6:5) beside Market map (cols 10–12, tall, the same re-tinted map) → Activation breakdown boxscore (cols 4–12) → Audience profile (cols 4–7) · Momentum (cols 8–12) → Cross-domain taste (cols 4–8) · Promo zones (cols 9–12) → Artist vs artist (cols 4–12, Venn-free: two aligned 100% bars showing shared vs distinct).
**Interactions:** linked brushing: hover a city anywhere (matrix, map, table row) and it highlights in every panel; filters apply live with a 150 ms crossfade; "Export CSV" per table.
**Signature moment:** linked brushing on Guadalajara: hovering its row lights its diamond in the matrix, its marker on the map, its tooltip in Cross-domain taste, all in the same frame.

---

## 5. Tour & Activation Book reader

**Purpose:** the deliverable a promoter forwards to the artist's manager or a sponsor: market selection, one activation chapter per city, and a provenance appendix. Reads like a printed tour book, density 5.

**Showcase book:** "Lumen Vale: Mexico, Brazil, US · Spring 2027". Shortlist of 6: Mexico City, Guadalajara, Monterrey, São Paulo, Curitiba, Rio de Janeiro. Chapters: Market selection · Mexico City · Guadalajara · Monterrey · São Paulo · Curitiba · Rio de Janeiro · Provenance (47 Qloo requests).

### 5a. Book reader · 375 px
**Content blocks, in priority order**
1. Top bar (52 px): close, "Tour & Activation Book" Inter 15/600, **Chapters** text button (opens the index sheet).
2. **Cover**: a composite tour poster (the six city posters as a 2 × 3 grid of 4:5 crops with 2 px canvas gaps), title in Fraunces `display` 32 px "Lumen Vale", line 2 "Mexico, Brazil, US · Spring 2027"; tagline in 13 px stone: "Don't just find your fans. Win their city."
3. **Market selection chapter**: chapter head in Fraunces 32 px; the winnability boxscore (City · Heat · Activation · Win · Verdict) for all 9 scored cities with the shortlisted 6 marked by a gold left rail 3 px; then "Density-only vs winnability" as a slope chart (two columns of ranks, lines between, Guadalajara and Curitiba highlighted gold); integrity line.
4. **City chapter** (e.g. Guadalajara): chapter opener = full-width 4:5 key art, then city name in Fraunces, verdict chip, advance-sheet key–value block (Top zone, Best room, Support, Sponsors top 3, Merch drop, This week), then the activation sections as continuous reading (not cards), each section ending with "7 verified · 2 removed" for the chapter.
5. **Provenance appendix**: boxscore of requests (# · tool · inputs summary · status · cached), 47 rows, mono hashes truncated `a91f…3c`.
6. Sticky bottom action bar (above safe area): **Share** (Web Share API, secondary) · gold **Download PDF** · **.ics** (secondary icon button with label "Calendar").

**Interactions:** Chapters sheet lists chapters with page-like markers (city accent swatch 8 px + name + short verdict), tap to jump; reading progress shows as a 2 px gold bar under the top bar; swipe is vertical scroll only.

**Signature moment:** each city chapter opens with a "page turn": the key art arrives with its city-accent perforated rail sliding in from the left edge (240 ms), the only motion in the reader, like a tab on a printed book.

### 5b. Book reader · 1280 px
**Layout:** two-column reader: chapter index cols 1–3 (sticky, city accent swatches, current chapter in bone with gold 2 px left bar); page column cols 4–10 at a fixed 720 px measure on `#282722` with 56 px padding (the "printed page"); cols 11–12 margin notes: source chips and claim counts aligned to the paragraph they support. This matches the existing print layout; the print stylesheet uses the same page column.
**Content priority:** cover → market selection (boxscore + slope chart) → city chapters → provenance. Action bar becomes a right-aligned group in the top bar: Share · **Download PDF** · Calendar (.ics).
**Interactions:** index click smooth-scrolls; ⌘P prints the same layout; hovering a margin source chip highlights the claim it supports.
**Signature moment:** the margin notes. As a paragraph scrolls into the reading line, its source chips in the margin brighten from stone to bone, so provenance visibly travels with the text.

---

## 6. Checklist before sending any brief to Stitch
- Preamble pasted first; brief second; viewport stated (375 or 1280).
- Real sample data from §0, never lorem or round numbers.
- One primary gold action per screen; verdicts always icon + label.
- No banned tell from DESIGN.md §9 in the output; reject and re-prompt otherwise.
