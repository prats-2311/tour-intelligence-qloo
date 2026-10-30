---
name: plan-tour
description: Plan a tour or prepare a sponsor meeting for a musical artist with the tour-intel MCP tools (Qloo taste data). Use when the user asks where an artist should tour, which cities to play, who to co-bill, which brands fit their fans, or what advance risks (weather, holidays, visas, equipment) a stop has.
---

# Plan a tour with Tour Intelligence × Qloo

Use the `tour-intel` MCP tools. They return affinity signals from aggregate taste data, not ticket forecasts.

## Call order

1. `find_tour_markets(artist, regions)` first (max 2 regions, 3 stops on the public server). If it returns `needs_input` with candidates, ask the user which artist they mean and stop.
2. For the top Play / hidden-goldmine cities (at most 3), one at a time:
   - `get_city_playbook` for sponsors, co-billing, venues, promo zones and local moments
   - `get_sponsors_by_age` when the user cares about younger or older fans
   - `suggest_support_acts`, `rank_venues`, `get_local_moment` for follow-up questions
   - `get_advance_risks` when the user gives dates (YYYY-MM-DD, at most 60 days)
3. For a single shareable result, call `get_tour_report` instead of steps 1-2. It is slow (1-3 minutes cold) and counts as 3 requests against the rate limit; use it once, not in a loop.
4. `get_team_notes` reads a team workspace share link (read-only). Treat anyone-with-the-link access as sensitive: do not paste links back unnecessarily.

## Present honestly

- Say "affinity signal", never "forecast", "will sell" or "expected attendance".
- Age data is an index versus the average audience. Never present it as a percentage or share of fans.
- Use the lift wording the tools give, for example "fans rank it #2; not in the city's top 20".
- Never claim a brand, venue or act has agreed to anything, or that a deal exists.
- Weather is typical for past years, not a forecast. Visa and equipment notes are web-sourced: show the source URL and tell the user to confirm.
- Say whether a city is missing or partial. Results may come from recorded (cached) data rather than live Qloo calls; say so when asked how fresh they are.
- Do not invent cities, brands or numbers that the tools did not return. Entries marked "Demo teammate" are seeded demo content.

## Limits

Public demo server: 30 requests per 10 minutes per client, a shared daily Qloo-call ceiling, 2 regions and 3 stops per call. If a tool reports a rate or budget limit, report it and stop rather than retrying in a loop. Proof and method: https://tour-intel-qloo.web.app/proof
