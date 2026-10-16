# Anti-AI-look gate and visual review (Plan 2, Task 14)

Tools: taste-skill `lint.mjs` (static) and `inspect.mjs` (rendered), run 2026-10-16 against the fixture build
(`VITE_QLOO_FIXTURES=1`). Rendered markup is captured by `dashboard/e2e/snapshots.mjs` (`node e2e/snapshots.mjs`
with the dev server up; writes `test-results/html`, `test-results/shots`, both git-ignored).

## Results

| Check | Target | Result |
| --- | --- | --- |
| `lint.mjs` on rendered body markup (script/style stripped) | landing, board, insights | 0 FAIL, 0 WARN each |
| Computed-style sweep (shadows, gradients, font families on every non-map element) | landing, board, insights | 1 shadow found (`.btn-gold` inset highlight, fixed); 0 gradients; fonts Inter, Fraunces, JetBrains Mono only |
| `lint.mjs src` (whole source tree) | 95 files | Plan 2 surfaces clean after fixes below; remaining FAILs are legacy Plan-0 files or spec'd (see exceptions) |
| `inspect.mjs` `/` and `/tours/board?sample=1` at 1280 and 375 | | Remaining findings are all accepted exceptions below |

## Fixes made

1. `.btn-gold` inset highlight (inspect `button-fx`): removed in round 1, restored in fix round 1 (R28) because DESIGN.md:262 keeps it as a material cue; recorded as an accepted exception below. No glow, no gradient.
2. Map label markers used `text-shadow` (inspect `text-shadow`, 4 hits). Replaced by a stroke halo (`paint-order: stroke fill`, 3px `#151410` text stroke); same legibility, no shadow.
3. Touch targets (layout spec, strict 44x44): the Winnability / Density-only tabs rendered 176x36 on mobile because the `h-11` tablist container with `p-1` squeezed them. Container is now `h-[52px]` on mobile (tabs 44px), unchanged at `lg`.

## Accepted exceptions (with reasons)

- **button-fx / shadow on `.btn-gold`**: 1px inset top highlight `inset 0 1px 0 rgba(255,255,255,.25)`, a material cue kept by DESIGN.md:262; not a drop shadow or glow.
- **mono / micro-label / small-text / body-size / font-count (JetBrains Mono, Fraunces, Inter, "Helvetica Neue")**: DESIGN.md spec'd the three faces; mono 11px tracked caps is the specified style for column heads, KPI numbers and field labels (DESIGN.md 4 and the Stitch prompt). "Helvetica Neue" comes from MapLibre's own CSS stack. Body 12px figure is the dense data rows from the references.
- **eyebrow ("Hidden goldmine" above "72" on landing)**: false positive; it is the verdict chip in the real Tour Board row fragment, not a kicker above a heading.
- **gradient**: (a) `body` faint gold house light, the single wash DESIGN.md 9 allows; (b) `.skeleton` shimmer, a loading state only (`li.skeleton`, visible only while streaming/empty). Legacy campaign components (`StatTile`, `StatMeter`, `CueCard`, `CompareCities` bar) also carry gradients/shadows; they are outside Plan 2's routes and untouched.
- **shadow in source**: AppShell campaign-switcher menu and TourGuide are real overlays (allowed); `WinnabilityMatrix.tsx:47` matches the word "shadow" in a comment; ChatBits/CueCard/Dashboard are legacy campaign UI.
- **hairline**: `border-b` row separators in real tables (boxscore, matrix table) and the form-field/tablist borders; AppShell footer `border-t`. Accepted as table/form rules.
- **claude-palette `#f0eee6`**: `--color-ink` token (warm bone text on cards). DESIGN.md bone family; not a cream background. `palette-cream`/`grey-body` warnings: bone `#f2f0ea` text and stone secondary `#a4a094` are the spec'd tokens (5.9:1 and above).
- **few-pictures / no-footage**: not applicable to a data tool; the map is the picture and DESIGN.md 9 bans stock photos.
- **emoji in `client.test.ts`**: a multi-byte SSE test fixture, not UI.
- **em-dash warning (69 across source)**: the required sample banner and spec'd strings use em dashes; copy reviewed in earlier tasks.
- **`animate-pulse` / `h-screen`**: only in legacy ChatBits typing indicator and AppShell shell; not on judge-path routes.

## Visual diffs (screenshots vs `docs/design/stitch/*/screen.png`)

Reference pairs: board desktop vs `tour_board_lumen_vale_desktop_1280_800`, landing desktop vs
`tour_intelligence_landing_desktop_1280_800_2`, insights desktop vs `taste_insights_lumen_vale_desktop_1280px`.

Structure: matches (two-column board with map left and ranked list right; landing hero left, map plus verdict card right; insights filter rail, KPI strip, matrix, map, boxscore).

Remaining differences, all accepted as minor or data/live-mode dependent:
- Board desktop: the map panel is inset with rounded corners and stops at about 745px, leaving empty canvas below the fold on tall viewports; the reference fills the viewport height edge to edge. Spacing only.
- Board: no hexbin heat, dashed route line or selected-row gold outline in the capture because nothing is selected and the sample has no tour route; the reference shows the selected state. Colour/state, not structure.
- Board: reference has a Strategist button, "Without Qloo" tab and Compare link in the toolbar; the product ships Winnability / Density-only only (spec scope).
- Map tiles are OpenFreeMap dark, not the re-tinted CARTO of the reference; land is nearly black with no warm tint (colour).
- Landing: no hexbin cluster or dashed arc on the map fragment, verdict chip sits in the row instead of the card header, backtest link and "Proof" nav item absent (not built), nav is left-aligned rather than centred.
- Insights: no "Active filter" chip, claims KPI or median-benchmark row; momentum has a single series (no peers); filter rail is wider with checkbox lists only. Content differences from live-only data.
- Mobile board (375): list scrolls under a fixed bottom tab bar; in full-page captures the fixed bar appears mid-page, which is a capture artefact. Map pin labels overlap where Curitiba and Sao Paulo are close together at 375 (label collision, not fixed).

# Plan 3 gate (Task 15): City Playbook and Tour Book

Run 2026-10-16 against the fixture build (`E2E_PORT=5199 node e2e/snapshots.mjs`, `lint.mjs` on the captured markup, `inspect.mjs` on the live
playbook route and on a static capture of the loaded Book, because inspect only waits about two seconds and the Book prepares its chapters after the board stream).

## Results

| Check | Target | Result |
| --- | --- | --- |
| `lint.mjs` on rendered body markup | `/tours/playbook/4005539?sample=1`, `/tours/book?sample=1` | 0 FAIL, 0 WARN each |
| Computed-style sweep | both routes | shadows: `.btn-gold` inset highlight only; gradients: perforated rail holes only (radial, see exceptions); fonts Inter, Fraunces, JetBrains Mono only |
| `lint.mjs` on Plan 3 source (30 files) | pages, `components/playbook`, `components/book` | FAILs are the accepted `mono` and `hairline` entries below; 1 WARN em-dash (spec'd strings) |
| `inspect.mjs` playbook at 1280 and 375 | | only the accepted exceptions below (class matches Plan 2's board/landing list) |
| `inspect.mjs` Book (loaded capture) at 1280 and 375 | | only the accepted exceptions below |

## Fixes made

1. Book chapter: the rule above the "Removed claims" block (`border-t`) is gone; spacing carries the separation (inspect `hairline` 4 to 3 rows, all real tables).
2. Layout gate found three touch-target failures, fixed in the owning components: the Landing "Guadalajara" stretched link (115x25, now `min-h-11`), and the Playbook "Add to tour" / "Remove from tour" button (collapsed to 23px because `flex-1` sat in a column flex; now `w-full`).

## Accepted exceptions (each with its DESIGN.md line)

- **gradient (perforated rail)**: `PlaybookCard` top rail and Book chapter tab use a `radial-gradient` only to punch the perforation holes over a flat city colour (DESIGN.md 4.2 CueCard rail; city colour on city-scoped surfaces only, DESIGN.md 2.6). No colour gradient. Carry `taste-skill-ignore` comments.
- **gradient (`.skeleton` shimmer)**: loading state only, same exception as Plan 2.
- **mono / micro-label / small-text / body-size / font-count**: JetBrains Mono 11px tracked caps for column heads, card meta lines and KPI numbers is the specified style (DESIGN.md 4); the dense advance-sheet and boxscore text follows the references. Same entry as Plan 2.
- **button-fx**: `.btn-gold` 1px inset top highlight (DESIGN.md 262).
- **eyebrow (playbook)**: the mandatory "Sample data — illustrative, not Qloo output" banner sits above the city heading (spec 5.6, honesty rule). It carries information and cannot be folded into the headline.
- **eyebrow (Book)**: false positive, "Sponsors · Cites missing evidence" is a card status line directly above a "Provenance" sub-heading.
- **hairline (Book)**: `border-b` row rules in the Market selection and Provenance tables, and the 1px key line in the slope-chart legend. Real tables (DESIGN.md 4, same as boxscore).
- **side-scroll at 375 (Book)**: the Market selection and Provenance tables scroll sideways inside their own container with a sticky city column; the page itself never scrolls horizontally (layout spec). Deliberate data-table pattern, same as the Insights boxscore.
- **focal-point, few-pictures, no-footage, still-page**: a data tool whose picture is the deterministic typographic poster and the map; DESIGN.md 9 bans stock photos and decorative motion. Largest type is the Fraunces city or artist name.
- **covered-text (Book, 375, from the static capture)**: artefact of the captured file, where the fixed chapter list and action bar lose their fixed positioning. Live screenshots at 375 show the header, action bar and tab bar over scrolled content with no heading covered.
- **palette-cream / grey-body / font-fallback**: bone `#f2f0ea` and stone `#a4a094` are the spec'd tokens; fonts are declared and load in the live app (the static capture has no font files).
