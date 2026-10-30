# tour-intel for Claude Code

Tour Intelligence × Qloo as a Claude Code plugin: a public MCP server plus a `plan-tour` skill that tells the agent how to use it and how to present results honestly.

## Install

```
/plugin marketplace add prats-2311/tour-intelligence-qloo
/plugin install tour-intel@tour-intelligence-qloo
```

No sign-in and no API key. The plugin connects to the public MCP server at `https://tour-intel-mcp-public-602700957663.us-central1.run.app/mcp`.

## Tools

| Tool | Use it to |
|---|---|
| `find_tour_markets` | Score and rank touring markets (verdict, fan heat, activation, winnability) |
| `get_city_playbook` | Compact playbook for one artist in one city |
| `suggest_support_acts` | Co-billing acts with shared taste and local affinity |
| `rank_venues` | Rank up to 10 venues by taste fit |
| `get_local_moment` | Local events, scenes and places that fit the audience |
| `get_sponsors_by_age` | Brands by age group (index vs the average audience, fan rank, city rank) |
| `get_advance_risks` | Typical weather, holidays, visa and equipment notes with sources |
| `get_team_notes` | Read a team workspace from its share link (read-only) |
| `get_tour_report` | One call: board plus top city playbooks, as JSON and a markdown report |

The server also offers the prompts `plan_tour` and `brief_for_sponsor_meeting`, and the resource `tour-intel://about`.

## Limits

- Every score is an affinity signal from aggregate taste data, not a ticket forecast and not a claim about individuals.
- Public demo: 2 regions and 3 stops per call, 30 requests per 10 minutes per client (`get_tour_report` counts as 3 and takes 1-3 minutes on a cold cache), and a shared daily Qloo-call ceiling.
- Results may come from recorded (cached) data. Weather is typical for past years, not a forecast; visa and equipment notes are web-sourced, so confirm them.

## Privacy

No sign-in, no accounts, nothing stored by the server about you. Your IP is hashed to scope the rate limit and budget. Artist, city and region names you send go to the Qloo gateway. Team workspaces are readable by anyone with the link, so do not share links you do not want others to see.

Proof and method: https://tour-intel-qloo.web.app/proof. License: MIT.
