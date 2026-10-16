# Stitch screens: Tour Intelligence × Qloo

Project: `projects/12743471427122715421` ("Tour Intelligence × Qloo"). Generated 16 Oct 2026.

## Design system

- **Asset:** `assets/7864294346658919828` (version 1), "Premiere Noir — Tour Intelligence × Qloo". It is attached to the project (`get_project` shows it as the project `designTheme`).
- **How it was made:** I used the fallback, `create_design_system`. I did not try `upload_design_md`, because DESIGN.md base64-encodes to about 50 KB. That is more than an MCP tool argument can carry. The upload-to-stitch skill says the same and offers an HTTP upload script instead, but that script needs the Stitch API key and user sign-off first.
- **Tokens:** DARK mode. Custom colour, primary override and focus colour are all `#ffcc00`. Secondary override `#e9e4d6` (bone), tertiary `#0f9d8a` (verdict teal), neutral `#1c1b18`, variant FIDELITY. Label font JETBRAINS_MONO, body font INTER, roundness ROUND_EIGHT. I also passed typography and spacing tokens straight from the DESIGN.md frontmatter.
- **Font substitution:** Stitch's font list has no Fraunces. I set the headline font to **NEWSREADER** and passed over PLAYFAIR_DISPLAY. Newsreader is the closer match: it is a soft serif with optical sizes. Playfair is a high-contrast didone, which is the third-wave "premium serif" tell. In practice the generated HTML loads Fraunces from Google Fonts anyway, because the designMd and the prompts name it.
- **designMd:** a condensed DESIGN.md. It keeps the frontmatter and §1–§10, including the Banned list and the §10.1 preamble, and drops the §11 evolution log.
- **Not done:** `update_design_system`. The create-tool instructions ask for it, but the asset already shows up in `list_design_systems` and on the project.

## Big blocker: screen IDs are missing

Seven of the eight `generate_screen_from_text` calls returned "The operation timed out". This is the MCP client timeout; generation keeps running on the server. Normally you poll `get_screen`, but that needs a screen ID, and neither discovery tool returns one:

- `list_screens` returns `{}` every time, with or without the `projects/` prefix. It returns `{}` even after the Landing MOBILE screen definitely exists.
- `get_project` returns no `screenInstances`.

The screens do exist. The project thumbnail is a finished Tour Board MOBILE (see the self-critique below), and `updateTime` moves forward after each call. But their IDs can only be read from the Stitch web UI: open a screen, and the ID is the hex in the URL. I tried a direct HTTP call to the Stitch MCP endpoint and it was denied by permissions, so I left it there.

What this blocked:
- Step 3: variants for Tour Board M/D and Taste Insights D, plus the brutalist variant. Every one needs a source screen ID.
- Step 4: `edit_screens` fixes on the timed-out screens.

**Next step:** Prateek, copy the screen IDs from the Stitch UI into the table below. Then run the variant and edit prompts written out at the end of this file.

## Screens

| # | Screen | Device asked | Screen id | Resource name | Status |
|---|---|---|---|---|---|
| e | Landing | MOBILE | `be985e04000949dea8556835746dd355` | `projects/12743471427122715421/screens/be985e04000949dea8556835746dd355` | Complete (title "Tour Intelligence — Landing (Mobile 375px)") |
| a | Tour Board | MOBILE | _unknown (timed out)_ | – | Exists (it is the project thumbnail) |
| b | Tour Board | DESKTOP | _unknown (timed out)_ | – | Probably exists; not verifiable |
| c | City Playbook (Guadalajara) | MOBILE | _unknown (timed out)_ | – | Probably exists; not verifiable |
| d | Taste Insights | DESKTOP | _unknown (timed out)_ | – | Probably exists; not verifiable |
| f | Landing | DESKTOP | _unknown (timed out)_ | – | Probably exists; not verifiable |
| g | City Playbook (Guadalajara) | DESKTOP | _unknown (timed out)_ | – | Probably exists; not verifiable |
| h | Taste Insights | MOBILE | _unknown (timed out)_ | – | Probably exists; not verifiable |

### Preview URLs (from get_screen / generate output; these are signed Google URLs and may expire)
- Landing MOBILE screenshot: https://lh3.googleusercontent.com/aida/AEtjO1W0rdozfVvrpmhcFPKxTAfFVKJp8R2m4ZSYucsZDBOW2g4npCTOfApYkk9gjWKu5JHzyrYzVYmCfAcXLYCVzlpwFYg9ENZpMqoEerqe1lE_L46cUPl3sia2hSV4ibJKGrIaJ3aayvuUg2zvq6zP8DRMzo9OxIoVqPqv0PclrwkJBIalHcBFn_5NDgtY9KRq9uC0IgzDICAaiUxmCe24dWs9J7HRvkjdtcVq9cp-80sr-r1qi_D0Y_qLSsau
- Landing MOBILE HTML: https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2IwODRjYWNmNmNkNTQ3NjNhZjJhNmI4M2UxMjNjYTc2EgsSBxDP1ryMuwwYAZIBJAoKcHJvamVjdF9pZBIWQhQxMjc0MzQ3MTQyNzEyMjcxNTQyMQ&filename=&opi=96797242
- Project thumbnail (Tour Board MOBILE): https://lh3.googleusercontent.com/aida/AEtjO1XO45XO_E5NLg1C5Dt1t8JrdG9PISZzasPzai6Bdm_Ob6izovfGfYA5dhjyRHIPa23dsO0m2vu1KLAje-n7nA-4zCCJ9ZEoaBn_OqIuwvb7T9QaTAn6_0t4Wc9TV34j1eoh6h7c04bYKv2Ggb9_13RDD5N04j4z5HLv8Slgmb3wNaAA5wRoRx4sj141d0nHprPAVOPnaHY04ZiXLJ6SWdTeKPusZvheSfPZ5pFIsQyDRHTVALBYb0_PQ5wJ

## Prompts used

Every prompt is DESIGN.md §10.1 preamble, verbatim, + "SCREEN: …" + an enhanced brief from `screen-briefs.md`. The enhancement follows the enhance-prompt skill: a numbered PAGE STRUCTURE, exact sample data from §0, component terms from §10.3, and a closing "SIGNATURE MOMENT" plus explicit bans.

All calls used model GEMINI_3_8_FLASH and passed `designSystem: assets/7864294346658919828`.

Deviation from the generate-design skill: that skill says to keep hex codes and font names out of generation prompts when a design system exists. The task explicitly says to prepend the §10.1 preamble, which contains them, so I followed the task.

| Screen | Brief section | Data and blocks in the prompt |
|---|---|---|
| a Tour Board MOBILE | §2a | Header with agent chip. Map at about 40% with verdict-shaped markers. Bottom sheet holding the segmented control, the summary line and routing rows 1–5 with exact heat/activation/winnability values. Sticky "Build tour" and "Why this score?". Tab bar plus FAB. Signature: the goldmine rows show gold > bone, Los Angeles the reverse. |
| b Tour Board DESKTOP | §2b | 56px top bar. Map in columns 1–7, routing list in columns 8–12 with all 10 rows (Belo Horizonte as "Not enough data · 1 of 4 inputs"). Segmented control, agent chip, Compare toggle. Footer "4 markets shortlisted" with Build tour. Integrity line. Guadalajara row highlighted and linked to its map diamond. |
| c City Playbook MOBILE | §3a | 4:5 fuchsia/bone risograph poster with jacaranda motif. Identity block. 2×2 advance sheet. Sticky tabs. "Sponsors · 1 of 7" counter. Sponsors CueCard with perforated fuchsia rail and the 5 brands, plus a peeking Merch card. Reasoning summary. Sticky "Add to tour". |
| d Taste Insights DESKTOP | §4b | Filter rail in columns 1–3 with Hidden goldmine checked. KPI strip. Winnability matrix with all 10 coordinates. Market map. Activation boxscore with 8 rows (only Guadalajara's numbers come from the brief; the other 7 rows I made up to be consistent with each city's activation score). Audience diverging bars. Momentum chart. Signature: goldmine filter fades every other marker to 20%. |
| e Landing MOBILE | §1a | Wordmark + Proof link. "Win / their city." Supporting line. Full-bleed Guadalajara routing row. Gold "Try the showcase tour" and tonal "Plan your own". Integrity foot line. 7% gold house light. |
| f Landing DESKTOP | §1b | Left columns 1–5: headline, copy, CTAs. Right columns 6–12: 7:8 map panel. Guadalajara row in its own band below the map. |
| g City Playbook DESKTOP | §3b | Identity in columns 1–5, 16:9 poster in columns 6–12. Asymmetric card grid: Sponsors 5 / Promo zones 7; Venue / Co-billing / Local moment at 4/4/4; Merch 7 / This week 5. Every card has rail, badge and source chip. |
| h Taste Insights MOBILE | §4a | Header with Filters (2). Scrollable StatTiles. Square matrix. Boxscore with sticky column (5 rows). Audience profile with tag list. Momentum chart. Goldmine filter signature. |

Mobile prompts and edit prompts are not stored in Stitch. The full text is in this session's transcript; each prompt is the §10.1 preamble plus the brief section above, nearly word for word.

## Self-critique (Banned list + tells.md)

### e Landing MOBILE (`be985e04…dd355`): checked against the HTML and screenshot
Passes: two-line left-aligned headline in solid bone, so no gradient text, no italic or coloured word, no centred hero, no feature cards, no badges, no logos. One gold CTA. Real data row as the proof. Integrity line present. No emoji (Material Symbols icons). No purple.

Problems, none of them a hard ban, so no edit made:
1. Stitch ignored `deviceType: MOBILE`. The screen is stored as DESKTOP, 2560×2048, with a 375px column centred on a wide canvas. Regenerate or edit as a true mobile frame if a phone mock is needed.
2. The house light is a blurred gold circle (`blur-[90px]`) rather than DESIGN's radial-gradient. It looks right but is technically a "glow" element. Swap to `radial-gradient(1100px 520px at 82% -12%, rgba(255,204,0,0.07), transparent 60%)`.
3. The city name in the row is set in Fraunces 20. DESIGN §4.6 says routing rows use Inter 17/600; Fraunces is reserved for titles and city headers.
4. Bar labels and values are 11px, against DESIGN's 13px minimum for sentence text. There are no threshold ticks. The Activation value is gold text; it should be bone mono.
5. Large dead gap between the row and the CTAs. That puts the CTAs in the thumb zone, which is fine, but the screen feels empty.

### a Tour Board MOBILE: checked against the project thumbnail only (HTML not reachable without an ID)
Passes: warm charcoal ground, bottom sheet, segmented control, correct verdict chips (teal Play, solid gold goldmine), bone/gold dual bars with values, big mono winnability, gold active-tab bar, tab bar labels.

Banned tells to fix once the ID is known:
1. **Index numbering "01 / 02 / 03 / 04"** (zero-padded mono). This is a banned tell (tells.md §4). The rank should be a plain "1, 2, 3".
2. Mono header row "# · MARKET / AFFINITY SIGNAL · VERDICT · WIN" is decorative tracked caps above a list. Delete it.
3. City names are in Fraunces. Rows should use Inter 17/600.
4. The Strategist FAB overlaps the "Build tour" button.
5. Map geography is invented: Curitiba is drawn near Guadalajara and Brazil isn't legible. Accept as a mock, but the real build uses MapLibre.
6. Bar label "Fan heat" wraps onto two lines.

### b, c, d, f, g, h
Not inspected; no ID means no HTML or screenshot. Run the checklist above on each once the IDs are known.

## Edits made
None. The only screen I could inspect (Landing MOBILE) shows no hard-banned tell. The screen that does (Tour Board MOBILE, index numbering) can't be edited without its ID.

## Ready-to-run follow-ups (paste once IDs are known)

**Edit: Tour Board MOBILE** (fixes the tells above):
> In the routing rows, replace the zero-padded rank numbers "01, 02, 03…" with plain "1, 2, 3" in 13px stone. Delete the mono column-header row "# · MARKET / AFFINITY SIGNAL · VERDICT · WIN". Set city names in Inter 17px semibold instead of the serif. Keep the "Fan heat" label on one line. Move the Strategist floating button so it sits above the sheet footer and no longer overlaps the gold "Build tour" button.

**Variants:** Tour Board MOBILE, Tour Board DESKTOP, Taste Insights DESKTOP. `variantCount 2, creativeRange EXPLORE, aspects [LAYOUT, COLOR_SCHEME]`. Prompt:
> Explore alternative layouts for this routing board while keeping the Premiere Noir palette (warm charcoal #1c1b18 ground, ticket gold #ffcc00 as the only accent, verdict colours unchanged). No purple, no gradients, no glass, no pill badges, no zero-padded index numbers.

**Brutalist competing direction:** Taste Insights DESKTOP. `variantCount 1, creativeRange REIMAGINE, aspects [LAYOUT, TEXT_FONT]`. Prompt:
> Reimagine this evidence room as Swiss print meets tactical terminal, on the same dark palette: warm charcoal #1c1b18 ground (not pure black), bone #f2f0ea text, ticket gold #ffcc00 as the single accent standing in for the hazard red. Zero border radius everywhere. A rigid blueprint grid where panels are separated by 1px gaps showing a slightly lighter #26251f underlay (gap-as-rule). Extreme type scale: one oversized heavy grotesque numeral, "72" for Guadalajara's winnability, bleeding off the matrix panel, against dense 11px uppercase JetBrains Mono tables. Boxscore tables dominate. Verdict chips become square stamped labels with icon + text. No scanlines, no glow, no crosshair ornaments, no ASCII brackets, no fake coordinates or version stamps (DESIGN.md bans mono-as-decoration). Keep all data values.

## Spec clarification: Tour Board toggle "Without Qloo"
This replaces the brief's §2a wording. "Without Qloo" shows the plain ranked list Gemini would produce with no taste data:
- City names only, in the generic order. No Fan heat or Activation bars, no verdict chips, no winnability numbers, no evidence or source chips.
- A banner above the list on `#26251f` with a `CircleAlert`-style stone icon: **"Generic LLM answer — no taste evidence"**.
- That comparison is the proof of Qloo's value: the same list without bars, verdicts or evidence.

None of the generated Tour Board prompts drew the Without Qloo state; they only labelled the toggle. To show it, generate it as a separate state screen or `edit_screens` variant once the Tour Board IDs are known:
> Show the "Without Qloo" segment selected. Replace the routing rows with a plain ranked list of city names and country codes only (Mexico City, Los Angeles, São Paulo, Rio de Janeiro, Austin, Guadalajara, Monterrey, Chicago, Curitiba), no bars, no verdict chips, no scores. Above the list add a stone banner on #26251f: "Generic LLM answer — no taste evidence".
