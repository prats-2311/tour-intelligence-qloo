---
name: Premiere Noir — Tour Intelligence × Qloo
colors:
  # Surfaces (extracted verbatim from dashboard/src/index.css @theme)
  canvas: '#1c1b18'
  canvas-raised: '#26251f'
  paper: '#282722'
  paper-raised: '#32312a'
  canvas-line: 'rgba(240, 238, 230, 0.09)'
  # Text
  canvas-text: '#f2f0ea'
  canvas-muted: '#a4a094'
  ink: '#f0eee6'
  ink-muted: 'rgba(240, 238, 230, 0.58)'
  # Brand accent (the one accent)
  gold: '#ffcc00'
  gold-soft: '#ffe066'
  gold-press: '#efb900'
  on-gold: '#1d1a10'
  # Data inks (new, derived; contrast-checked)
  bone: '#e9e4d6'
  # Verdicts (new; validated all-pairs on #1c1b18 and #282722)
  verdict-play: '#0f9d8a'
  verdict-play-text: '#5fd3be'
  verdict-goldmine: '#ffcc00'
  verdict-goldmine-mark: '#b88a00'
  verdict-derisk: '#e8606f'
  verdict-derisk-text: '#ff9aa4'
  verdict-consider: '#5a86e8'
  verdict-consider-text: '#a8c0f4'
  verdict-skip: '#8b877c'
  verdict-skip-text: '#bdb8ab'
  # City identity slots 1–8 (1–5 extracted from index.css/cityTheme.ts; 6–8 new, validated)
  city-1: '#ff3d00'
  city-2: '#0091ea'
  city-3: '#ff00aa'
  city-4: '#009e5c'
  city-5: '#7c4dff'
  city-6: '#c27c00'
  city-7: '#00a0b0'
  city-8: '#a39200'
  # Status (system state, not verdicts)
  state-error: '#fca5a5'
  state-error-bg: '#2a1615'
  state-stale: '#d9b45a'
  # Map
  map-land: '#1f1e1a'
  map-water: '#151410'
  map-road: 'rgba(240, 238, 230, 0.07)'
  map-label: '#7d796f'
typography:
  display-hero:
    fontFamily: Fraunces
    fontSize: 88px
    fontWeight: '500'
    lineHeight: 0.95
    letterSpacing: -0.03em
  display:
    fontFamily: Fraunces
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 1.0
    letterSpacing: -0.02em
  title:
    fontFamily: Fraunces
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 1.1
    letterSpacing: -0.015em
  kpi:
    fontFamily: JetBrains Mono
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 1.0
    letterSpacing: -0.02em
  heading:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 1.25
    letterSpacing: -0.01em
  body:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 1.5
    letterSpacing: '0'
  small:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 1.4
    letterSpacing: '0'
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 1.2
    letterSpacing: 0.08em
rounded:
  sm: 4px
  md: 8px
  lg: 10px
  xl: 14px
  2xl: 18px
  full: 9999px
spacing:
  unit: 4px
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  14: 56px
  18: 72px
  gutter-mobile: 12px
  gutter-desktop: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

# Design System: Premiere Noir — Tour Intelligence × Qloo

> "Don't just find your fans. Win their city."
> Single source of truth for Stitch generation and every UI implementer. Binding together with spec §7 and §11.0.
> Extracted from `dashboard/src/index.css`, `dashboard/src/lib/cityTheme.ts`, `dashboard/src/components/ui/*` (StatTile, StatMeter, CueCard, ThinkingTrace), `AppShell.tsx`, `pages/Dashboard.tsx`, `pages/CityDetail.tsx`, and `dashboard/CLAUDE.md`. Evolutions are marked **[evolved]** with the reason.

---

## 1. Visual Theme & Atmosphere

**A promoter's war room after the house lights go down.** The ground is a warm, almost-brown charcoal (`#1c1b18`), never black; surfaces rise toward the viewer in single tone steps (canvas, then card, then well), the way stage risers catch the spill. Type does two jobs and never swaps them: a confident Fraunces serif sets the marquee (screen titles, city names, the Book's chapter heads), and uppercase JetBrains Mono stamps the call sheet (KPI values, boxscore column heads, advance-sheet fields). Inter carries everything a person actually reads. Gold (`#ffcc00`) is the house light: it marks the one action on a screen and the one idea the product sells, *activation*, the part of a market you can win.

The product is a working tool for promoters, booking agents and label marketers, so it borrows the visual grammar of their trade, not of SaaS: the **routing board** (a ranked list of markets you can scan in one pass), the **advance sheet** (dense key–value fields per city), the **boxscore / settlement table** (right-aligned tabular numbers, totals rows), and **tour-poster key art** (one generated poster per city, set like a gig poster, not a stock photo). Density is Pollstar-confident, closer to a terminal than to a marketing page, but every screen still has exactly one thing that leads.

| Dial | Value | Meaning here |
|---|---|---|
| Density | **7 / 10** (Landing 3, Book reader 5, Tour Board 7, Taste Insights 8) | Dense data, clear hierarchy, nothing decorative |
| Variance | **6 / 10** | Asymmetric splits (map / list, 8 / 4 columns), one deliberate break per screen |
| Motion | **4 / 10** | Motion only where it explains state: agent steps arriving, verdict reveal, sheets |

One identity, **no light/dark toggle**. `color-scheme: dark` on `:root`.

---

## 2. Color Palette & Roles

### 2.1 Surfaces (extracted, unchanged)
| Name | Hex | Role |
|---|---|---|
| **Warm Charcoal Canvas** | `#1c1b18` | Page ground. 70–85% of every screen. Never `#000`. |
| **Canvas Raised** | `#26251f` | Chrome on the canvas: top bar, bottom tab bar, agent-log panel, skeleton base, filter well |
| **Card (token `paper`)** | `#282722` | Content cards, bottom sheets, table body. The token is named `paper` for history; it is a dark card, not white. Do not "fix" it. |
| **Card Raised (`paper-raised`)** | `#32312a` | Inputs, segmented-control thumb, hovered table row, wells inside a card |
| **Line (`canvas-line` / `line`)** | `rgba(240,238,230,0.09)` | Only for: boxscore row separators, sheet grabber, focus-adjacent dividers. Not for boxing cards. |

Depth comes from the tone step, not from borders or shadows. One step per layer; never nest a card inside a card of the same tone.

### 2.2 Text (extracted)
| Name | Value | Contrast | Role |
|---|---|---|---|
| **Bone White (`canvas-text`)** | `#f2f0ea` | 15.1:1 on canvas | Primary text and numbers on the canvas |
| **Card Ink (`ink`)** | `#f0eee6` | 13.1:1 on card | Primary text on cards |
| **Warm Stone (`canvas-muted`)** | `#a4a094` | 6.6:1 canvas / 5.7:1 card | Secondary text, units, axis labels |
| **Card Ink Muted (`ink-muted`)** | `rgba(240,238,230,0.58)` (≈ `#9c9a94` on card) | 5.3:1 | Secondary text on cards |
| **On Gold (`on-gold`)** | `#1d1a10` | 11.5:1 on gold | Every glyph that sits on gold. Never `ink` on gold (ink is light). |

### 2.3 The accent: Ticket Gold (extracted)
| Name | Hex | Role |
|---|---|---|
| **Ticket Gold** | `#ffcc00` | Primary button fill (one per screen), active tab indicator, focus ring, selection, the Hidden goldmine chip, the Activation bar |
| **Gold Soft** | `#ffe066` | Hover fill on gold buttons; Activation bar fill on dark wells |
| **Gold Press** | `#efb900` | Pressed state |

Gold covers **under 5% of any screen**. Its meaning is fixed: *the thing you can win / do next*. It is never used for headings, body links, icons in lists, or decoration.

### 2.4 Data inks (new)
| Name | Hex | Role |
|---|---|---|
| **Bone (Fan heat)** | `#e9e4d6` | Fan heat bar fill, map heat peak, focus-artist line when gold is taken. 11.8:1 on card. |
| **Gold (Activation)** | `#ffcc00` / `#ffe066` | Activation bar fill. Gold = the Qloo activation layer everywhere in the product. |
| **Heat ramp (sequential, one hue)** | `#3a382f` → `#555146` → `#736e60` → `#958f7f` → `#bab3a1` → `#e9e4d6` | Map hexbins, promo-zone heat, in-table heat cells. Lightness strictly monotonic. Lowest two steps are "near zero" and may sit under 3:1. |

### 2.5 Verdicts (new, validated)
Validated with the dataviz skill's `validate_palette.js --mode dark --pairs all` on **both** `#1c1b18` and `#282722`: lightness band PASS, chroma PASS, normal-vision worst ΔE 17.3 PASS, contrast ≥ 3:1 PASS, CVD worst ΔE 7.5 (De-risk vs Goldmine mark, deutan) = **WARN band → secondary encoding is mandatory**, which the icon + label + marker-shape rule below provides. Skip is a deliberately recessive neutral and sits outside the categorical set.

| Verdict | Mark hex (bars, dots, quadrant tint) | Chip | Icon (lucide) | Map / scatter marker | Rule (spec §5.3) |
|---|---|---|---|---|---|
| **Play** | `#0f9d8a` Stage Teal | bg `#243c35`, text `#5fd3be` (6.5:1) | `Play` (filled) | filled circle ● 10px | heat ≥ 70 and activation ≥ 60 |
| **Hidden goldmine** | `#b88a00` Goldmine Ochre (charts) | **solid** `#ffcc00`, text `#1d1a10` (11.5:1). The only filled chip. | `Gem` | diamond ◆ 12px | 45 ≤ heat < 70 and activation ≥ 75 |
| **De-risk** | `#e8606f` Warning Coral | bg `#4b3130`, text `#ff9aa4` (5.8:1) | `TriangleAlert` | triangle ▲ 11px | heat ≥ 70 and activation < 45 |
| **Consider** | `#5a86e8` Steel Blue | bg `#313846`, text `#a8c0f4` (6.5:1) | `Scale` | ring ○ 10px, 2px stroke | winnability ≥ 55 |
| **Skip** | `#8b877c` Stone (neutral) | bg `#3a3832`, text `#bdb8ab` (5.9:1) | `SkipForward` | small × 8px | otherwise |
| **Insufficient data** | none | bg `#26251f`, text `#a4a094`, label "Not enough data" | `CircleDashed` | hollow square □ 8px at 50% | fewer than 2 activation inputs |

**Never colour alone.** Every verdict appears as icon + label (+ marker shape in charts). The transport-control metaphor is intentional: *Play* and *Skip* read like a set list.

### 2.6 City identity slots (extracted 1–5, new 6–8)
Slots 1–5 are the committed Premiere Noir hexes (`index.css`, `cityTheme.ts`); slots 6–8 were added for 8-city shortlists. The full 8-slot order was validated (`--mode dark`, adjacent pairs) on `#1c1b18` and `#282722`: ALL PASS, worst CVD ΔE 9.5, worst normal-vision ΔE 19.9, all ≥ 3:1.

| Slot | Hex | Name | Showcase assignment (Lumen Vale) |
|---|---|---|---|
| 1 | `#ff3d00` | Vermilion | Mexico City |
| 2 | `#0091ea` | Cobalt | Los Angeles |
| 3 | `#ff00aa` | Fuchsia | Guadalajara |
| 4 | `#009e5c` | Pitch Green | São Paulo (legacy continuity) |
| 5 | `#7c4dff` | Electric Violet | Monterrey |
| 6 | `#c27c00` | Amber | Rio de Janeiro |
| 7 | `#00a0b0` | Lagoon | Curitiba |
| 8 | `#a39200` | Olive Brass | Austin |

Rules: a city's slot is assigned once, in shortlist order, and **never follows rank** (re-sorting never repaints). City colour appears only on surfaces *about one city*: Playbook header rail, key-art frame, Book chapter tab, the perforated CueCard rail, the city's line in a multi-city chart. On the Tour Board and in verdict charts, colour encodes **verdict**, not city. Slot 5 violet is data identity only: never on a button, glow, gradient or background wash. A 9th city folds to neutral `#a4a094`.

### 2.7 System states
| State | Treatment |
|---|---|
| Error | bg `#2a1615` (≈ `red-950/20` over canvas), text `#fca5a5` (`red-300`, extracted), icon `CircleAlert`. Plain sentence: "Qloo didn't answer for Brazil. Showing Mexico and US." |
| Stale / from cache | text `#d9b45a`, icon `History`, label "From cache · 2 h ago" |
| Partial | Stone text + count: "3 of 4 inputs" |
| Live | No pulsing dot. A static `Radio` icon + "Live" in Warm Stone. |

---

## 3. Typography Rules

### 3.1 Families and jobs (extracted, constrained)
- **Fraunces** (400/500/600, `@fontsource/fraunces`): the marquee. Only for: Landing headline, screen titles, city names in the Playbook header and Book chapter heads, Tour-poster key-art lettering. Never in tables, cards, chips, buttons or charts. Fallback `ui-serif, Georgia, serif`.
- **JetBrains Mono** (500–800): the call-sheet stamp. Only for: KPI values, scores in bars, boxscore column headers, advance-sheet field labels, the agent-log tool name, request hashes. Uppercase only when it is a label; numbers stay as numbers. Fallback `ui-monospace, "SF Mono", monospace`.
- **Inter** (400/500/600/700): everything people read: body, card titles, buttons, chips, tabs, chart labels, tooltips. Enable `font-feature-settings: "tnum" 1, "cv11" 1` app-wide so every number is tabular and the single-storey *a* softens Inter's default look.

### 3.2 Scale: seven sizes, nothing in between
| Token | Font | Size mobile / desktop | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|---|
| `display-hero` | Fraunces | 48 / 88 px | 500 | 0.95 | -0.03em | Landing headline only |
| `display` | Fraunces | 32 / 40 px | 600 | 1.0 | -0.02em | Screen titles ("Tour Board"), Book chapter heads |
| `title` | Fraunces | 24 / 28 px | 600 | 1.1 | -0.015em | City name on Playbook header and card detail |
| `kpi` | JetBrains Mono | 24 / 28 px | 700 | 1.0 | -0.02em | KPI values, winnability score, hero figures |
| `heading` | Inter | 17 / 20 px | 600 | 1.25 | -0.01em | Card titles, sheet titles, section heads |
| `body` | Inter | 15 px | 400 | 1.5 | 0 | Paragraphs (max 62ch), list rows |
| `small` | Inter | 13 px | 500 | 1.4 | 0 | Secondary lines, table cells, chart labels, chips |
| `label-mono` | JetBrains Mono | 11 px | 600 | 1.2 | +0.08em, uppercase | Column heads, field labels, tab bar labels |

**[evolved]** The code uses 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13 px for labels. Collapse them: nothing under 11 px (mono caps) or 13 px (sentence text).

### 3.3 Rules
- Hierarchy through size and tone, not boldness. One dominant size per screen.
- Headlines ≤ 2 lines at every viewport; screen titles 1–4 words; sentence case.
- `text-wrap: balance` on headings, `pretty` on paragraphs. Fraunces optical size: let `opsz` follow size (`font-optical-sizing: auto`).
- Numbers: always `tabular-nums`, right-aligned in columns, unit in Warm Stone at `small` size after a thin space (`84 /100`, `0.84 fit`, `24% of heat`).
- **[evolved] No gradient text.** `.title-sheen` (white→silver clip) is retired; titles are solid `#f2f0ea`. Gradient headline text is a banned tell.
- Light-on-dark: drop one weight step from what you'd use on light; never use Inter 700 for body.

---

## 4. Component Stylings

### 4.1 Buttons
- **Primary (gold):** flat `#ffcc00`, text `#1d1a10` Inter 15/600, height 48 px mobile / 40 px desktop, radius 10 px, padding 0 20 px. Hover (pointer devices only) `#ffe066`; press `#efb900` + `scale(0.98)` in 120 ms. Disabled: bg `rgba(240,238,230,0.10)`, text `rgba(240,238,230,0.35)` (extracted from `.btn-gold:disabled`). One per screen. Label is the action: "Try the showcase tour", "Build tour", "Download PDF".
  **[evolved]** `.btn-gold`'s vertical gradient and gold hover glow are retired (glowing/gradient CTA is a banned tell). Keep only the 1 px inset top highlight `inset 0 1px 0 rgba(255,255,255,0.35)` as a material cue.
- **Secondary:** bg `#32312a`, text `#f0eee6`, same metrics, no border. Hover bg `#3a3932`.
- **Text action:** Inter 13/500 `#f0eee6`, underline offset 0.18em on hover. "Why this score?", "See all 47 requests".
- Focus: `outline: 2px solid #ffcc00; outline-offset: 2px` on every interactive element.

### 4.2 Cards and city containers
- **CueCard (extracted, kept as the signature card):** bg `#282722`, radius 18 px, no border, top rail 10 px tall punched with 16 mm filmstrip/ticket perforation (radial holes 2.75 px radius every 14 px) in the **city accent**. Used only for city-scoped content (Playbook cards, Book chapters). Meta line in `label-mono`, e.g. `GDL · 14 MAR 2027 · 1,800 CAP`.
- **Routing row (Tour Board list item):** not a floating card. Rows on `#282722` separated by 2 px canvas gaps (tone, not lines), radius 14 px on the first/last row of a group only. Height 96 px mobile, 72 px desktop. See 4.6.
- **StatTile (extracted):** label in `label-mono` Warm Stone, value in `kpi`, hint in `small`. Surface `#26251f`. **[evolved]** drop the white/[0.08] hairline border and gradient; tone step only. Optional 3 px top rail only when the tile is city-scoped.
- **Shadows:** none on resting cards. Floating layers only:
  - Popover / menu: `0 8px 24px -8px rgba(8,7,4,0.6)` (extracted, warm-tinted)
  - Bottom sheet / side drawer: `0 -16px 48px -12px rgba(8,7,4,0.6)` (extracted, inverted for sheets)
  - FAB: `0 6px 18px -6px rgba(8,7,4,0.7)`

### 4.3 Navigation
- **Mobile bottom tab bar:** height 64 px + safe-area inset, bg `#26251f`, three tabs (spec §7.2): **Discover · Tours · Strategist**. Each target ≥ 44×44 px; icon 22 px (`Compass`, `Route`, `MessagesSquare`), label `label-mono` 11 px. Active: label and icon `#f2f0ea` plus a 3 px × 20 px gold bar above the icon; inactive `#a4a094`. No blur, no floating pill.
- **Desktop top bar:** 56 px, bg `#26251f`, wordmark left ("Tour Intelligence" in Fraunces 18/600 + "× Qloo" Inter 13 Warm Stone), links Inter 14/500 (Discover, Tours, Insights, Proof), the Strategist toggle right. Active link: `#f2f0ea` + 2 px gold underline 6 px below baseline. **[evolved]** the 240 px left sidebar and the "Agentic Cinema OS" tagline are retired: the spec moves desktop navigation to a top bar.
- **Sticky sub-tabs (Playbook):** 44 px tall, Inter 14/500, active tab gold 2 px underline, horizontally scrollable with scroll-snap and a 24 px right fade into canvas. Order: How to win · Local acts (the Culture and Delight tabs were removed: they depended on the legacy campaign flow).
- **Segmented control (Winnability / Density-only / Without Qloo):** track `#26251f`, thumb `#32312a`, radius 10 px, 40 px tall, labels Inter 13/600. Thumb slides with a spring.

### 4.4 Inputs and forms
- Filled field `#32312a`, no border, radius 10 px, height 48 px mobile / 40 px desktop, text Inter 15. Label above in Inter 13/500 Warm Stone; error below in `#fca5a5` 13 px with `CircleAlert`. Focus ring gold 2 px.
- **Entity picker (`needs_input`):** bottom sheet listing candidates as rows (thumbnail 40 px rounded 8 px, name Inter 15/600, disambiguator in 13 px Stone, "Use this artist" on tap). Title: "Which Lumen Vale?" Never auto-picks.
- Filter chips (Taste Insights): height 32 px (44 px hit area), radius 8 px, bg `#26251f`, selected bg `#32312a` + `Check` icon 14 px. Not pills.

### 4.5 Verdict chip
Height 24 px (28 px on Playbook header), radius 4 px (a stamp, not a pill), padding 0 8 px, icon 14 px + 6 px gap + Inter 12/600 sentence-case label. Colours per §2.5. Hidden goldmine is the only solid chip; all others are tinted. On reveal the chip stamps in (see §7).

### 4.6 Fan heat vs Activation dual bars
The heart of the Tour Board row and the Book's market table.
- Two stacked horizontal bars, 6 px tall, 8 px apart, radius 3 px (rounded data-end only), track `rgba(240,238,230,0.08)`.
- **Fan heat** in Bone `#e9e4d6`; **Activation** in Ticket Gold `#ffcc00`. Same 0–100 scale, same width, left-aligned so the two lengths compare directly.
- Label column left (Inter 13/500 Stone: "Fan heat", "Activation"), value right in JetBrains Mono 13/700 bone (`62`, `82`).
- Threshold ticks: 1 px × 10 px ticks in `#a4a094` at the verdict cut points (heat 45 and 70; activation 45, 60, 75). They make the rule visible without reading the formula.
- Winnability is shown once, as the row's `kpi` number at right (`72`), never as a third bar.
- `insufficient_data`: the missing bar renders as an empty track with "1 of 4 inputs" in 13 px Stone. Never a filler value.

### 4.7 Agent log and "Thinking" chip (spec §7.4)
- **Chip:** 32 px tall (44 px hit), bg `#26251f`, radius 8 px, `Radio` icon + "Agent · 47 Qloo calls" Inter 13/600. While running: the label carries a single left-to-right sheen sweep (1.4 s, `shimmer` keyframe, extracted) and the count ticks up; when done the sheen stops. No pulsing dot.
- **Log (sheet on phone, 360 px side panel on desktop):** a vertical timeline (step marker 20 px, extracted from `ThinkingTrace.tsx`: pending `#1c1b18` ring, active gold, success teal `#5fd3be` `Check`, error `#fca5a5` `TriangleAlert`). Each line: sentence in Inter 13 (`Finding where Lumen Vale's fans concentrate in Brazil… 14 hotspots → 4 cities`), then tool name + duration in JetBrains Mono 11 Stone (`qloo_where_popular · 1.8 s`), then `From cache` tag when cached. Lines are rendered from real events, never LLM-written.
- **Model reasoning summary:** collapsible panel titled "Model reasoning summary", body Inter 13/1.55 Stone, followed by tool chips (`qloo_recommend · brand`) at 24 px. Labelled as such; never "AI thoughts".
- **Grounding badge:** "7 verified · 2 removed" Inter 12/600, `ShieldCheck` 14 px teal for verified count, Stone for removed. Tap → audit list with reason per removed claim.

### 4.8 Boxscore / settlement table
- Header row: `label-mono` Stone, bottom rule `rgba(240,238,230,0.09)`. Body rows 44 px mobile / 40 px desktop, Inter 13, numbers JetBrains Mono 13/500 right-aligned. Row separators the same 9% line (tables are the one place rules are allowed). Totals / median row: bg `#32312a`, Inter 13/600.
- Sticky first column on mobile; horizontal scroll inside the table only (never the page). Hover row `#32312a`.

### 4.9 Map
- MapLibre GL + OpenFreeMap **dark** vector style (keyless), warm-tinted via style overrides: land `#1f1e1a`, water `#151410`, parks `#22211c`, roads `rgba(240,238,230,0.07)` (major roads 0.11), country borders `rgba(240,238,230,0.18)` 1 px, labels from the style's label layers recoloured `#7d796f` Inter 11. No blue water, no cold greys.
- Fan heat hotspots: hexbins (H3 res 4 nationally, res 8 in-city) on the six-step Heat ramp (§2.4), opacity 0.85. Heat reads as stage light spilling on a dark floor.
- City markers: verdict shapes (§2.5) with a 2 px `#1c1b18` ring; selected marker scales 1.25 and gains a 26 px ring in its verdict mark colour at 30%. City name label Inter 12/600 bone beside Play and Hidden goldmine markers only (selective labelling).
- Attribution in 11 px Stone bottom-left; zoom controls hidden on phone (pinch), 36 px squares on desktop.
- Phone: map occupies the top ~45% (spec), one-finger pan inside the map only.

### 4.10 Charts (dataviz rules, binding)
- One axis per chart; no dual-axis. Thin marks: 2 px lines, ≥ 8 px markers, bars with 4 px rounded data-end and a 2 px surface gap between adjacent bars/segments.
- Gridlines `rgba(240,238,230,0.06)`, axes labels 11 px Stone, no chart borders, no 3D, no donuts.
- Legend always present for ≥ 2 series; ≤ 4 series also direct-labelled. Text wears text tokens, never the series colour.
- Highlight vs context: the focus artist (Lumen Vale) is drawn in Gold 2.5 px; comparison artists in `#736e60` / `#958f7f` / `#bab3a1` with direct labels.
- Every chart has a **source chip** ("Qloo · 3 requests") that opens the requests behind it, and a "Table" toggle for an accessible table view.
- Hover/tap: crosshair + tooltip on lines; per-mark tooltip on bars/dots; tooltip bg `#32312a`, radius 8 px, Inter 13, popover shadow.
- Texture fallback (45°/135° hatching) only under `forced-colors` or print.

### 4.11 Key art (tour poster)
- One generated poster per city, 4:5 portrait (Playbook header, Book chapter opener) and 16:9 (desktop header crop). Gig-poster language: two-colour risograph feel using the **city accent + bone on canvas**, Fraunces or hand-lettered city name, a single motif drawn from that city's Qloo local-moment results. Grain is part of the image, never a CSS overlay. Never stock photography, never AI-glossy 3D, never people's faces.
- While generating: a skeleton in the exact 4:5 frame, `.skeleton` shimmer (extracted), caption "Drawing the Guadalajara poster…".

### 4.12 Empty, partial, stale, loading
- **Loading:** skeletons matching the final geometry (rows, bars, map frame) using `.skeleton` (`#26251f` with a faint gold sweep, 1.4 s; static at 75% opacity under reduced motion). **[evolved]** `.morphing-loader` (gold→violet conic blob with glow) is retired.
- **Empty (no data):** draw the *shape* of the missing data in Stone outline at 40%: e.g. for Promo zones, the empty hex grid of the city with "Qloo returned no neighbourhood data for Curitiba" in 13 px and one action ("Try a wider radius"). No illustrations of people, no mascots.
- **Partial:** show what arrived; missing components render as empty tracks labelled "Not returned". Header carries "3 of 4 inputs".
- **Stale:** amber `#d9b45a` `History` icon + "From cache · cached 14 Oct, 09:12".
- **Error:** inline, one sentence, one retry. No "Oops", no exclamation marks.

---

## 5. Layout Principles

### 5.1 Grid and structure
- **Mobile (base 375 px):** 4 columns, 16 px outer margin, 12 px gutter. Single column of content. No horizontal page scroll at 360 px.
- **Tablet (768 px):** 8 columns, 24 px margin, 16 px gutter.
- **Desktop (1280 px):** 12 columns, 32 px margin, 24 px gutter, content max 1440 px (wide screens cap at 1600). Running text max 62ch.
- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`.
- Full-height screens use `min-height: 100dvh`, never `100vh`.

### 5.2 Spacing (4 px base)
`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72`. Inside a card 16 px (mobile) / 20 px (desktop). Between cards 12 px / 16 px. Between screen sections 40 px / 56 px. Space above a heading is at least twice the space below.

### 5.3 Data density rules
- A Tour Board phone screen shows **≥ 3.5 city rows** above the tab bar with the sheet at half height; desktop list shows ≥ 8 rows without scrolling at 800 px viewport height.
- Every row carries: city + country code, verdict chip, two bars with values, winnability number. Nothing else on the row. Detail lives one tap away.
- Max 3 text tones per component (bone, stone, one verdict/gold). Max 1 gold element per row.
- Numbers never wrap; truncate names with ellipsis before shrinking numbers.

### 5.4 Alignment and balance
- Asymmetric splits on desktop: map 7 / list 5 (Tour Board), header 5 / key art 7 (Playbook), filters rail 3 / panels 9 (Insights).
- Left-anchored text. The only centred element allowed per screen is a sheet grabber or an empty-state line.
- Each screen breaks its own rule once on purpose (named in each screen brief as its signature moment).

### 5.5 Responsive behaviour and touch
- Touch targets ≥ 44×44 px; primary action in the bottom 40% of the phone screen (thumb zone).
- **Bottom sheets** (phone): radius 18 px top corners, bg `#282722`, grabber 36×4 px `rgba(240,238,230,0.24)` centred 8 px from top, snap points 25% / 55% / 92% of viewport. Sheets become **right side drawers** on desktop (400 px; Agent log 360 px), never modals.
- Strategist: FAB 56 px (bottom-right, 16 px above tab bar), gold `MessagesSquare` on `#32312a`; becomes a docked 400 px right panel on desktop.
- Map gestures never fight scroll: the map region owns one-finger pan; sheets own vertical scroll.

---

## 6. Iconography and imagery
- lucide-react (existing dependency), **stroke 1.75**, sizes 14 / 18 / 22 px only. One icon per meaning; verdict icons are reserved (§2.5).
- No emoji anywhere. No rocket/shield/sparkle clichés for features (**[evolved]** the `Sparkles` icon in ThinkingTrace becomes `Radio` for the agent log; the model-reasoning panel uses no icon, just the plain label "Model reasoning summary").
- Imagery = generated city key art (§4.11) and real map tiles only.

---

## 7. Motion & Interaction

Motion explains state. If it doesn't show where something came from, confirm an action, or reveal a result, it doesn't ship.

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` (extracted from StatMeter) | Enters, bar fills |
| `--ease-in-out` | `cubic-bezier(0.76, 0, 0.24, 1)` | Things travelling on screen (sheet snaps, segmented thumb) |
| `--t-press` | 120 ms | Button press scale 0.98 |
| `--t-hover` | 160 ms | Colour changes |
| `--t-ui` | 240 ms | Tabs, popovers |
| `--t-sheet` | spring `stiffness 320, damping 32` | Bottom sheets / drawers |
| `--t-tile` | spring `stiffness 260, damping 24` (extracted from StatTile) | KPI tiles, verdict stamp |
| `--t-bar` | 700 ms `--ease-out` (extracted) | Fan heat / Activation fills |

Purposeful moments (the complete list):
1. **Agent steps stream in**: each log line slides 8 px up + fades in as its event arrives (real timing, not staged).
2. **Bars fill** once per mount, Fan heat first, Activation 120 ms later.
3. **Verdict stamp**: chip scales 1.15 → 1.0 with `--t-tile` spring and a 1-frame gold flash for Hidden goldmine only.
4. **Re-rank**: switching Winnability / Density-only / Without Qloo animates row positions with FLIP (`layout` springs, `stiffness 400, damping 38`). Rows move; colours never change.
5. **Sheets** snap with the sheet spring; leaving is 70% of arriving.

Banned: fade-up on every block, hover lift on cards, bounce/elastic easing, infinite decorative loops (pulsing dots, floating shapes, rotating badges), scroll hijacking, custom cursors, animating width/height/top/left (bars animate `transform: scaleX` from the left origin).

**Reduced motion** (`useReducedMotion` / `prefers-reduced-motion: reduce`): no travel, no scale, no shimmer; keep opacity crossfades ≤ 150 ms; bars render at final length; re-rank swaps instantly with a 150 ms opacity cross-fade.

---

## 8. Voice and microcopy
- Promoter vocabulary: *market heat, avails, hold, routing, advance, settlement, cap (capacity), support / co-bill, on-sale, market play*. Tabs and labels are nouns: "Sponsors", "Promo zones", "Venue fit".
- Sentence case everywhere except `label-mono`.
- Buttons name the action (1–3 words). No "Get started", "Learn more", "Explore".
- Integrity line, verbatim, wherever scores appear: "Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals."
- Plain numbers with honest precision: `0.84 fit`, `24% of heat`, `+18% in 90 days`. No round fakes.

---

## 9. Banned (acceptance gate for every screen)

### From taste-skill `references/tells.md` (applicable to this product)
- Violet/indigo gradients, glows or washes. **[evolved]** the body's violet corner wash `rgba(124,77,255,0.06)` is removed; keep only the gold house light `radial-gradient(1100px 520px at 82% -12%, rgba(255,204,0,0.07), transparent 60%)`.
- Gradient-filled headline text (retires `.title-sheen`).
- Glowing or gradient primary buttons (retires `.btn-gold` gradient + glow).
- Glassmorphism / backdrop blur panels, floating blurred pill navigation.
- Soft grey drop shadow under every card; 1 px outlined boxes as the way to separate surfaces.
- Three identical feature cards with icons in rounded squares; bento grids of feature tiles on Landing.
- Emoji as icons or bullets.
- Centred headline + subtitle + two buttons + screenshot hero.
- Eyebrow/kicker labels above headings; pill badges above the hero ("New", "Beta", "Powered by AI").
- One word of a headline in italic, colour or underline.
- Near-black + neon accent + glow.
- Fake dashboard hero built from grey bars and donuts (Landing shows the real Tour Board fragment).
- Decorative status dots / pulsing "live" dots.
- **Monospace as decoration** (tells.md §4): mono is allowed only for data (KPI values, column heads, advance-sheet field labels, tool names). No scattered tiny tracked caps captions (max 2 mono-label clusters per viewport outside tables), no index numbering (01 / 02 / "Step 02"), no design-tool chrome (crosshairs, crop marks, dashed guides), no agency micro-meta (local time strings, coordinates as ornament, version stamps, "Scroll").
- Headlines over two lines; nine near-equal font sizes; one 12–16 px radius on everything (radii follow §4 roles: 4 chips, 8 controls, 10 buttons/inputs, 14 rows, 18 cards/sheets).
- Invented social proof: no logo walls, testimonials, star rows, "10,000+ promoters".
- Copy tells: unlock, unleash, supercharge, elevate, empower, streamline, seamless, effortless, robust, cutting-edge, next-gen, game-changer, delve, tapestry; tricolon headlines; "not just X, it's Y" (the brand tagline is kept as a tagline in the Book cover and meta, not as the Landing H1); em dashes as habit; lorem ipsum; "Oops"; exclamation marks.
- Motion tells (§7 banned list).
- Cream + terracotta (not a risk on this dark identity; listed so no "warm it up" variant drifts there).

### From spec §11.0 (binding)
- Stock shadcn look (default zinc cards, default `Badge` pills, default `Tabs`).
- Purple/indigo gradients; generic glassmorphism; emoji-as-icons; "centered hero + three feature cards".
- Generic SaaS dashboard framing; marketing filler microcopy.
- Placeholder illustrations or stock imagery; un-tinted default map tiles.
- Fades everywhere; motion without a state change; ignoring reduced motion.
- Missing tabular numerals, inconsistent spacing off the 4/8 grid, missing focus states, targets under 44 px, empty states without the data's shape.
- Any number not traceable to its inputs; any LLM-written agent-log line; any filler score.

---

## 10. Design System Notes for Stitch Generation

### 10.1 Stitch prompt preamble (paste before every screen prompt)
> Premiere Noir, a warm dark planning tool for live-music tour promoters. Ground is warm charcoal #1c1b18 (never black); cards #282722, wells and inputs #32312a, chrome #26251f; depth from tone steps, no borders, no card shadows, no glass, no blur. Text bone #f2f0ea, secondary warm stone #a4a094. One accent, ticket gold #ffcc00 with near-black text #1d1a10, used for the single primary button, the active tab and the Activation bar only. Fraunces serif for screen titles and city names only; uppercase JetBrains Mono 11px tracked for table column heads, field labels and big KPI numbers; Inter for everything else, tabular numerals everywhere. Radii: 4px verdict chips, 10px buttons, 14px list rows, 18px cards and bottom sheets. Verdict chips always icon plus label: Play (teal #0f9d8a, play icon), Hidden goldmine (solid gold chip, gem icon), De-risk (coral #e8606f, warning triangle), Consider (steel blue #5a86e8, scale icon), Skip (stone #8b877c, skip-forward icon). Each city row shows two thin 6px bars on a 0–100 scale, Fan heat in bone #e9e4d6 and Activation in gold, with mono values at right. Maps use the keyless OpenFreeMap dark vector style, warm-tinted (land #1f1e1a, water #151410) with bone-coloured heat hexbins. Touring-industry layout language: routing board, advance sheet, boxscore tables, gig-poster key art. Mobile-first 375px with bottom tab bar (Discover, Tours, Strategist) and bottom sheets; desktop 1280px 12-column asymmetric grid with a 56px top bar. No emoji, no purple, no gradients on text or buttons, no glows, no centred hero with three feature cards, no eyebrow labels, no pill badges, no stock photos, no fake logos or testimonials, sentence-case copy written for promoters.

### 10.2 Language to use with Stitch
"warm charcoal stage-dark", "tone-stepped layered surfaces", "call-sheet mono labels", "marquee serif city name", "routing board list", "advance sheet key–value grid", "boxscore table with right-aligned tabular numbers", "two-colour risograph gig poster", "stamped verdict chip".

### 10.3 Component prompts
- *Routing row:* "A 96px-tall dark row (#282722, 14px radius) for 'Guadalajara, MX': left, city name Inter 17 semibold with 'MX · 3rd by winnability' in 13px stone; under it two 6px bars labelled Fan heat 62 (bone) and Activation 82 (gold) with small grey threshold ticks; right, a solid gold 'Hidden goldmine' chip with a gem icon and the number 72 in large JetBrains Mono."
- *Agent chip + log sheet:* "A compact 32px chip 'Agent · 47 Qloo calls' with a radio icon on #26251f; tapping opens a bottom sheet with a vertical timeline of plain-language steps, each followed by a mono tool name and duration, completed steps with a teal check."
- *Playbook card:* "A city-scoped card on #282722 with an 18px radius and a 10px fuchsia (#ff00aa) top rail punched with ticket perforations; mono meta line 'GDL · SPONSORS · 10 BRANDS'; a ranked list of brands with fit scores right-aligned; a '7 verified · 2 removed' badge at the foot."

### 10.4 Incremental iteration
1. Generate at 375 px first; check the first screen shows the screen's one leading element and the primary action in the thumb zone.
2. Then 1280 px as an expansion (same components, asymmetric grid), not a reflow of the phone.
3. Reject any variant showing: purple, gradients on text/buttons, glass, centred hero + 3 cards, pill badges, emoji, stock photos, or mono used as decoration. Re-prompt with the preamble plus "remove <tell>".
4. Iterate one component at a time (row → sheet → map styling), restating exact hexes.

---

## 11. Evolution log vs the shipped dashboard
| Shipped (index.css / components) | Now | Why |
|---|---|---|
| `.title-sheen` gradient clip | Solid `#f2f0ea` | Gradient headline text is a banned tell |
| `.btn-gold` vertical gradient + gold hover glow | Flat gold + 1 px inset highlight | Glowing/gradient CTA tell |
| Body violet corner wash | Removed; gold house light kept | Violet glow tell |
| `.morphing-loader` gold→violet conic blob with glow | Retired; geometry-matched `.skeleton` only | Violet + meaningless loop |
| StatMeter accent glow `0 0 8px` | No glow; flat fill | Neon-glow tell |
| StatTile hairline + gradient | Tone step `#26251f` | Hairline-box tell |
| 240 px sidebar, "Agentic Cinema OS" | Top bar (desktop), bottom tabs (phone) | Spec §7.2 |
| Labels at 9.5–12.5 px | 11 px mono caps / 13 px min sentence text | Legibility; nine-size tell |
| 5 city accents keyed to film cities | 8 slot-ordered accents, validated | 8-city shortlists |
| (none) | Verdict palette, Fan heat/Activation inks, heat ramp, map tint | New product surfaces |
