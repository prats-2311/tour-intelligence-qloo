# 7. Public MCP server and Claude Code plugin: scope and limits

Date: 2026-10-31. Status: accepted.

## Context
Agents are a likely consumer of this work: a planner asks an assistant to "find three markets for this artist and
brief me on sponsors". The Qloo hackathon runs on one shared key with an unpublished quota. We want a judge or any
developer to try the tools with no key and no sign-in, without letting a script drain the quota.

## Decision
- A public MCP server (`cloud_run/agent_mcp_server`, in public mode) exposes 9 tools, 2 prompts and 1 resource.
  Tools: `find_tour_markets`, `get_city_playbook`, `suggest_support_acts`, `rank_venues`, `get_local_moment`,
  `get_sponsors_by_age`, `get_advance_risks`, `get_team_notes` and `get_tour_report`. Prompts: `plan_tour` and
  `brief_for_sponsor_meeting`. Resource: `tour-intel://about`.
- It calls the IAM-private gateway with an identity token. It never holds a Qloo key.
- All tools are read-only. `get_team_notes` reads a workspace from its link and writes nothing.
- Limits in public mode: 2 regions and 3 stops per call; 30 requests per 10 minutes per client (`get_tour_report`
  counts as 3); a shared daily Qloo-call ceiling for public sessions (default 400) that is checked before the global
  ceiling, so public traffic cannot starve the dashboard.
- Each client gets a session id made from a hash of its IP, so the IP never reaches the gateway. Public sessions skip
  the Gemini local-act suggestions.
- The Claude Code plugin (`.claude-plugin/marketplace.json`, `plugins/tour-intel/`) wraps that server and adds a
  `plan-tour` skill that tells the agent how to present results honestly. It needs no key.
- Tool descriptions state the limits: affinity signals, not ticket forecasts; index values are not shares; weather is
  typical, not a forecast; web-sourced notes need confirming.
- The dashboard separately registers 11 WebMCP tools for Chrome. These run in the page, for the open session.

## Consequences
- It is a demo on the author's Qloo key. When the daily ceiling is hit, tools answer that the public limit is
  reached. A heavy user should run the gateway with their own key.
- Rate limit counters live in the server process, so they are per instance.
- Results can come from cached or recorded data and are labelled when they do.
- No write tools means an agent cannot change a team workspace. That is deliberate for a link anyone can use.
