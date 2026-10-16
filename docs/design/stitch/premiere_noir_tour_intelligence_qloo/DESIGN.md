---
name: Premiere Noir — Tour Intelligence × Qloo
colors:
  canvas: '#1c1b18'
  canvas-raised: '#26251f'
  paper: '#282722'
  paper-raised: '#32312a'
  canvas-line: 'rgba(240, 238, 230, 0.09)'
  canvas-text: '#f2f0ea'
  canvas-muted: '#a4a094'
  ink: '#f0eee6'
  ink-muted: 'rgba(240, 238, 230, 0.58)'
  gold: '#ffcc00'
  gold-soft: '#ffe066'
  gold-press: '#efb900'
  on-gold: '#1d1a10'
  bone: '#e9e4d6'
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
  city-1: '#ff3d00'
  city-2: '#0091ea'
  city-3: '#ff00aa'
  city-4: '#009e5c'
  city-5: '#7c4dff'
  city-6: '#c27c00'
  city-7: '#00a0b0'
  city-8: '#a39200'
  state-error: '#fca5a5'
  state-error-bg: '#2a1615'
  state-stale: '#d9b45a'
  map-land: '#1f1e1a'
  map-water: '#151410'
  map-road: 'rgba(240, 238, 230, 0.07)'
  map-label: '#7d796f'
typography:
  display-hero: {fontFamily: Fraunces, fontSize: 88px, fontWeight: '500', lineHeight: 0.95, letterSpacing: -0.03em}
  display: {fontFamily: Fraunces, fontSize: 40px, fontWeight: '600', lineHeight: 1.0, letterSpacing: -0.02em}
  title: {fontFamily: Fraunces, fontSize: 28px, fontWeight: '600', lineHeight: 1.1, letterSpacing: -0.015em}
  kpi: {fontFamily: JetBrains Mono, fontSize: 28px, fontWeight: '700', lineHeight: 1.0, letterSpacing: -0.02em}
  heading: {fontFamily: Inter, fontSize: 20px, fontWeight: '600', lineHeight: 1.25, letterSpacing: -0.01em}
  body: {fontFamily: Inter, fontSize: 15px, fontWeight: '400', lineHeight: 1.5}
  small: {fontFamily: Inter, fontSize: 13px, fontWeight: '500', lineHeight: 1.4}
  label-mono: {fontFamily: JetBrains Mono, fontSize: 11px, fontWeight: '600', lineHeight: 1.2, letterSpacing: 0.08em}
rounded: {sm: 4px, md: 8px, lg: 10px, xl: 14px, 2xl: 18px, full: 9999px}
spacing: {unit: 4px, gutter-mobile: 12px, gutter-desktop: 24px, margin-mobile: 16px, margin-desktop: 32px}
---

# Design System: Premiere Noir — Tour Intelligence × Qloo

> "Don't just find your fans. Win their city."

Note on fonts: Fraunces is the intended display serif (screen titles, city names). Stitch's font enum has no Fraunces, so the headline font token is Newsreader as the closest available soft optical-size serif. Load Fraunces from Google Fonts where possible.

## 1. Visual Theme & Atmosphere

A promoter's war room after the house lights go down. The ground is a warm, almost-brown charcoal (#1c1b18), never black; surfaces rise toward the viewer in single tone steps (canvas, then card, then well), the way stage risers catch the spill. Type does two jobs and never swaps them: a confident Fraunces serif sets the marquee (screen titles, city names, the Book's chapter heads), and uppercase JetBrains Mono stamps the call sheet (KPI values, boxscore column heads, advance-sheet fields). Inter carries everything a person actually reads. Gold (#ffcc00) is the house light: it marks the one action on a screen and the one idea the product sells, activation, the part of a market you can win.

The product is a working tool for promoters, booking agents and label marketers, so it borrows the visual grammar of their trade, not of SaaS: the routing board (a ranked list of markets you can scan in one pass), the advance sheet (dense key-value fields per city), the boxscore / settlement table (right-aligned tabular numbers, totals rows), and tour-poster key art (one generated poster per city, set like a gig poster, not a stock photo). Density is Pollstar-confident, closer to a terminal than to a marketing page, but every screen still has exactly one thing that leads.

Dials: Density 7/10 (Landing 3, Book reader 5, Tour Board 7, Taste Insights 8). Variance 6/10: asymmetric splits (map / list, 8 / 4 columns), one deliberate break per screen. Motion 4/10: only where it explains state.

One identity, no light/dark toggle. color-scheme: dark.

## 2. Color Palette & Roles

### 2.1 Surfaces
- Warm Charcoal Canvas #1c1b18: page ground, 70-85% of every screen. Never #000.
- Canvas Raised #26251f: chrome on the canvas: top bar, bottom tab bar, agent-log panel, skeleton base, filter well.
- Card (token paper) #282722: content cards, bottom sheets, table body. A dark card, not white.
- Card Raised #32312a: inputs, segmented-control thumb, hovered table row, wells inside a card.
- Line rgba(240,238,230,0.09): only for boxscore row separators, sheet grabber, focus-adjacent dividers. Not for boxing cards.

Depth comes from the tone step, not from borders or shadows. Never nest a card inside a card of the same tone.

### 2.2 Text
- Bone White #f2f0ea: primary text and numbers on canvas.
- Card Ink #f0eee6: primary text on cards.
- Warm Stone #a4a094: secondary text, units, axis labels.
- Card Ink Muted rgba(240,238,230,0.58): secondary text on cards.
- On Gold #1d1a10: every glyph that sits on gold.

### 2.3 The accent: Ticket Gold
- Ticket Gold #ffcc00: primary button fill (one per screen), active tab indicator, focus ring, selection, the Hidden goldmine chip, the Activation bar.
- Gold Soft #ffe066: hover; Gold Press #efb900: pressed.

Gold covers under 5% of any screen. Its meaning is fixed: the thing you can win / do next. Never for headings, body links, icons in lists, or decoration.

### 2.4 Data inks
- Bone (Fan heat) #e9e4d6: Fan heat bar fill, map heat peak.
- Gold (Activation) #ffcc00: Activation bar fill.
- Heat ramp (sequential, one hue): #3a382f -> #555146 -> #736e60 -> #958f7f -> #bab3a1 -> #e9e4d6. Map hexbins, promo-zone heat, in-table heat cells.

### 2.5 Verdicts (never colour alone: icon + label + marker shape)
- Play: mark #0f9d8a Stage Teal; chip bg #243c35, text #5fd3be; icon Play (filled); marker filled circle. Rule: heat >= 70 and activation >= 60.
- Hidden goldmine: mark #b88a00 (charts); chip SOLID #ffcc00 with text #1d1a10, the only filled chip; icon Gem; marker diamond. Rule: 45 <= heat < 70 and activation >= 75.
- De-risk: mark #e8606f Warning Coral; chip bg #4b3130, text #ff9aa4; icon TriangleAlert; marker triangle. Rule: heat >= 70 and activation < 45.
- Consider: mark #5a86e8 Steel Blue; chip bg #313846, text #a8c0f4; icon Scale; marker ring. Rule: winnability >= 55.
- Skip: mark #8b877c Stone; chip bg #3a3832, text #bdb8ab; icon SkipForward; marker small x.
- Insufficient data: chip bg #26251f, text #a4a094, label "Not enough data"; icon CircleDashed; marker hollow square.

### 2.6 City identity slots
1 #ff3d00 Vermilion (Mexico City), 2 #0091ea Cobalt (Los Angeles), 3 #ff00aa Fuchsia (Guadalajara), 4 #009e5c Pitch Green (São Paulo), 5 #7c4dff Electric Violet (Monterrey), 6 #c27c00 Amber (Rio de Janeiro), 7 #00a0b0 Lagoon (Curitiba), 8 #a39200 Olive Brass (Austin).
City colour appears only on surfaces about one city: Playbook header rail, key-art frame, Book chapter tab, the perforated CueCard rail, the city's line in a multi-city chart. On the Tour Board and in verdict charts, colour encodes verdict, not city. Slot 5 violet is data identity only: never on a button, glow, gradient or background wash.

### 2.7 System states
- Error: bg #2a1615, text #fca5a5, icon CircleAlert, one plain sentence.
- Stale: text #d9b45a, icon History, "From cache · 2 h ago".
- Partial: Stone text + count "3 of 4 inputs".
- Live: no pulsing dot; static Radio icon + "Live" in Warm Stone.

## 3. Typography Rules
- Fraunces (400/500/600): the marquee. Only for Landing headline, screen titles, city names in Playbook header and Book chapter heads, poster lettering. Never in tables, cards, chips, buttons or charts.
- JetBrains Mono (500-800): the call-sheet stamp. Only for KPI values, scores in bars, boxscore column headers, advance-sheet field labels, agent-log tool names, request hashes. Uppercase only when it is a label.
- Inter (400-700): everything people read. tabular-nums and cv11 app-wide.

Scale (mobile / desktop): display-hero Fraunces 48/88 500; display Fraunces 32/40 600; title Fraunces 24/28 600; kpi JetBrains Mono 24/28 700; heading Inter 17/20 600; body Inter 15 400; small Inter 13 500; label-mono JetBrains Mono 11 600 +0.08em uppercase. Nothing under 11px mono caps or 13px sentence text.

Rules: hierarchy through size and tone, not boldness. Headlines max 2 lines; titles 1-4 words; sentence case. Numbers tabular, right-aligned in columns, unit in Warm Stone after a thin space (84 /100, 0.84 fit, 24% of heat). No gradient text: titles are solid #f2f0ea.

## 4. Component Stylings

### 4.1 Buttons
- Primary (gold): flat #ffcc00, text #1d1a10 Inter 15/600, height 48 mobile / 40 desktop, radius 10px. Hover #ffe066, press #efb900. One per screen. Label is the action: "Try the showcase tour", "Build tour", "Download PDF". No gradient, no glow; only a 1px inset top highlight.
- Secondary: bg #32312a, text #f0eee6, no border.
- Text action: Inter 13/500, underline on hover. "Why this score?".
- Focus: 2px solid #ffcc00 outline, offset 2px.

### 4.2 Cards
- CueCard (signature card): bg #282722, radius 18px, no border, top rail 10px tall punched with filmstrip/ticket perforations in the city accent. City-scoped content only. Meta line in label-mono, e.g. GDL · 14 MAR 2027 · 1,800 CAP.
- Routing row (Tour Board list item): not a floating card. Rows on #282722 separated by 2px canvas gaps, radius 14px on the first/last row of a group only. Height 96 mobile, 72 desktop.
- StatTile: label in label-mono Warm Stone, value in kpi, hint in small. Surface #26251f. No border, no gradient.
- Shadows: none on resting cards. Popover 0 8px 24px -8px rgba(8,7,4,0.6); sheet 0 -16px 48px -12px rgba(8,7,4,0.6).

### 4.3 Navigation
- Mobile bottom tab bar: 64px, bg #26251f, three tabs Discover · Tours · Strategist (icons Compass, Route, MessagesSquare), label-mono labels. Active: bone + 3x20px gold bar above icon. No blur, no floating pill.
- Desktop top bar: 56px, bg #26251f, wordmark "Tour Intelligence" (Fraunces 18/600) + "× Qloo" (Inter 13 stone), links Discover, Tours, Insights, Proof; active link bone + 2px gold underline.
- Sticky sub-tabs (Playbook): 44px, Inter 14/500, active gold 2px underline. Activate · Culture · Delight · Talent.
- Segmented control (Winnability / Density-only / Without Qloo): track #26251f, thumb #32312a, radius 10px, 40px tall, Inter 13/600.

### 4.4 Inputs
Filled field #32312a, no border, radius 10px, 48/40px tall. Label above Inter 13 stone. Filter chips 32px, radius 8px, bg #26251f, selected #32312a + check icon. Not pills.

### 4.5 Verdict chip
Height 24px (28 on Playbook header), radius 4px (a stamp, not a pill), icon 14px + Inter 12/600 sentence-case label. Hidden goldmine is the only solid chip.

### 4.6 Fan heat vs Activation dual bars
Two stacked horizontal bars, 6px tall, 8px apart, radius 3px, track rgba(240,238,230,0.08). Fan heat in Bone #e9e4d6; Activation in Ticket Gold #ffcc00. Same 0-100 scale, left-aligned. Label left (Inter 13 stone "Fan heat", "Activation"), value right in JetBrains Mono 13/700 bone. Threshold ticks 1x10px #a4a094 at heat 45, 70; activation 45, 60, 75. Winnability shown once as the row's kpi number at right, never a third bar. Insufficient data: empty track with "1 of 4 inputs".

### 4.7 Agent log and chip
Chip 32px, bg #26251f, radius 8px, Radio icon + "Agent · 47 Qloo calls". Log: vertical timeline (pending ring, active gold, success teal check, error coral triangle). Each line: sentence in Inter 13, then tool name + duration in JetBrains Mono 11 stone (qloo_where_popular · 1.8 s), "From cache" tag when cached. Collapsible "Model reasoning summary" panel. Grounding badge "7 verified · 2 removed" with ShieldCheck teal.

### 4.8 Boxscore table
Header row label-mono stone with 9% bottom rule. Rows 44/40px, Inter 13, numbers JetBrains Mono 13 right-aligned. Totals row bg #32312a. Sticky first column on mobile.

### 4.9 Map
Dark CARTO tiles re-tinted: land #1f1e1a, water #151410, roads rgba(240,238,230,0.07), labels #7d796f. No blue water, no cold greys. Fan heat hexbins on the six-step heat ramp. City markers use verdict shapes with a 2px #1c1b18 ring; labels only beside Play and Hidden goldmine markers.

### 4.10 Charts
One axis per chart; 2px lines, >= 8px markers, bars with 4px rounded data-end. Gridlines rgba(240,238,230,0.06), axis labels 11px stone, no chart borders, no 3D, no donuts. Focus artist (Lumen Vale) in Gold 2.5px; comparison artists in #736e60 / #958f7f / #bab3a1 with direct labels. Every chart has a source chip ("Qloo · 3 requests") and a "Table" toggle.

### 4.11 Key art (tour poster)
One generated poster per city, 4:5 and 16:9. Two-colour risograph gig poster using the city accent + bone on canvas, hand-lettered city name, one motif from the city. Grain is part of the image. Never stock photography, never glossy 3D, never faces.

### 4.12 Empty, partial, stale, loading
Skeletons matching final geometry. Empty: draw the shape of missing data in stone outline at 40% with one plain sentence and one action. No illustrations of people, no mascots. Errors: one sentence, one retry, no "Oops", no exclamation marks.

## 5. Layout Principles
- Mobile 375px: 4 columns, 16px margin, 12px gutter. Desktop 1280px: 12 columns, 32px margin, 24px gutter, max 1440.
- Spacing on a 4px base: 4 8 12 16 20 24 32 40 56 72.
- Tour Board phone shows >= 3.5 city rows; desktop list shows >= 8 rows at 800px height.
- Every row: city + country code, verdict chip, two bars with values, winnability number. Nothing else.
- Asymmetric splits on desktop: map 7 / list 5 (Tour Board), header 5 / key art 7 (Playbook), filter rail 3 / panels 9 (Insights).
- Left-anchored text. Touch targets >= 44px; primary action in the thumb zone. Bottom sheets on phone (radius 18px top, grabber), right side drawers on desktop (400px).
- Strategist: FAB 56px gold MessagesSquare icon on #32312a.

## 6. Iconography
Lucide icons, stroke 1.75, sizes 14/18/22. No emoji anywhere. No rocket/shield/sparkle clichés. Imagery = generated city key art and real map tiles only.

## 7. Motion
Motion explains state only: agent steps stream in; bars fill once (heat first, activation 120ms later); verdict stamp; FLIP re-rank when switching Winnability / Density-only / Without Qloo; sheets snap. Banned: fade-up on every block, hover lift on cards, bounce, infinite decorative loops, pulsing dots.

## 8. Voice
Promoter vocabulary: market heat, avails, hold, routing, advance, settlement, cap, support / co-bill, on-sale, market play. Sentence case. Buttons name the action. No "Get started", "Learn more", "Explore". Integrity line verbatim wherever scores appear: "Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals."

## 9. Banned (acceptance gate)
- Violet/indigo gradients, glows or washes. Only allowed wash: a faint gold house light radial at top-right (7% opacity).
- Gradient-filled headline text. Glowing or gradient buttons.
- Glassmorphism / backdrop blur, floating blurred pill navigation.
- Soft grey drop shadow under every card; 1px outlined boxes to separate surfaces.
- Three identical feature cards with icons in rounded squares; bento grids on Landing.
- Emoji as icons or bullets.
- Centred headline + subtitle + two buttons + screenshot hero.
- Eyebrow/kicker labels above headings; pill badges above the hero ("New", "Beta", "Powered by AI").
- One word of a headline in italic, colour or underline.
- Near-black + neon accent + glow.
- Fake dashboard hero from grey bars and donuts.
- Decorative status dots / pulsing live dots.
- Monospace as decoration: no scattered tiny tracked caps, no index numbering (01 / 02), no crosshairs/crop marks/dashed guides, no agency micro-meta.
- Headlines over two lines; nine near-equal font sizes; one radius on everything (radii: 4 chips, 8 controls, 10 buttons/inputs, 14 rows, 18 cards/sheets).
- Invented social proof: no logo walls, testimonials, star rows.
- Copy tells: unlock, unleash, supercharge, elevate, empower, streamline, seamless, effortless, robust, cutting-edge, next-gen, game-changer; tricolon headlines; "not just X, it's Y"; lorem ipsum; "Oops"; exclamation marks.
- Cream + terracotta.
- Stock shadcn look; generic SaaS dashboard framing; placeholder illustrations or stock imagery; un-tinted default map tiles.
- Any number not traceable to its inputs; any filler score.

## 10. Stitch prompt preamble
Premiere Noir, a warm dark planning tool for live-music tour promoters. Ground is warm charcoal #1c1b18 (never black); cards #282722, wells and inputs #32312a, chrome #26251f; depth from tone steps, no borders, no card shadows, no glass, no blur. Text bone #f2f0ea, secondary warm stone #a4a094. One accent, ticket gold #ffcc00 with near-black text #1d1a10, used for the single primary button, the active tab and the Activation bar only. Fraunces serif for screen titles and city names only; uppercase JetBrains Mono 11px tracked for table column heads, field labels and big KPI numbers; Inter for everything else, tabular numerals everywhere. Radii: 4px verdict chips, 10px buttons, 14px list rows, 18px cards and bottom sheets. Verdict chips always icon plus label. Each city row shows two thin 6px bars on a 0-100 scale, Fan heat in bone #e9e4d6 and Activation in gold, with mono values at right. Maps are dark CARTO tiles re-tinted warm with bone-coloured heat hexbins. Touring-industry layout language: routing board, advance sheet, boxscore tables, gig-poster key art.
