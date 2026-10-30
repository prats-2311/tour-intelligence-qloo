"""Cloud Run entry point: a real Model Context Protocol server exposing
tour_data_api's own read-only tool layer to external callers -- not just our
internal Dialogflow CX Playbooks.

This is the "bidirectional MCP" half our own agents didn't have. Culture
Intelligence, Fan Enthusiasm, and Local Delight already consume
tour_data_api as their own internal tool layer (an OpenAPI Tool wired into
each Playbook, see /agent_builder/CLAUDE.md). This service exposes the SAME
tools -- thin HTTP wrappers around the identical tour_data_api routes, no
new logic -- as a real MCP server any external MCP client (a coding agent
in a terminal, another team's agent) can call directly, the same way it
calls any other tool. No chat UI, no dashboard click, required.

Deliberately read-only, plus rank_cities (a pure compute endpoint with no
side effects or data lookup): once a server is reachable by a caller we
don't control, it needs real access control. This service is deployed with
--no-allow-unauthenticated (Cloud IAM-gated, the same mechanism already
used for tour_data_api and delight_card_renderer) rather than inventing a
bespoke auth scheme, and its exposed tool surface is intentionally narrower
than tour_data_api's full route list -- no create_campaign, no city_briefs
writes, no live-search fan-out. A tool surface only our own agents ever
called didn't need to think about this; one open to callers we don't
control does.
"""

from __future__ import annotations

import contextvars
import hashlib
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4

import requests
from mcp.server.mcpserver import MCPServer
from starlette.responses import JSONResponse

# Load sibling modules relative to this file, regardless of cwd or how main was imported.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import insight_tools  # noqa: E402
import taste_tools  # noqa: E402
from gateway import gateway_url  # noqa: E402
from ratelimit import SlidingWindow  # noqa: E402

# Public demo mode: only the five taste tools, per-IP rate limit and gateway budget.
PUBLIC = os.environ.get("MCP_PUBLIC") == "1"
PUBLIC_MAX_REGIONS = 2
PUBLIC_MAX_STOPS = 3
REPORT_WEIGHT = 3  # get_tour_report counts as this many requests against the per-IP limiter
LIMITER = SlidingWindow(limit=30, window_s=600)
_REQUEST_IP: contextvars.ContextVar[str] = contextvars.ContextVar("request_ip", default="unknown")

# No default URL: the original Google-hackathon service must never be hit by accident.
TOUR_DATA_API = os.environ.get("TOUR_DATA_API_URL", "")
if not PUBLIC and not TOUR_DATA_API:
    raise RuntimeError("TOUR_DATA_API_URL is not set; refusing to start without this project's tour_data_api URL")
_METADATA_SA_BASE = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default"

if PUBLIC:
    mcp = MCPServer(
        "tour-intelligence-qloo",
        version="1.0.0",
        instructions=(
            "Taste tools from Tour Intelligence × Qloo: find tour markets a mid-tier artist can win, "
            "the per-city playbook (sponsor, co-bill, venue, local moment), sponsors by age group, "
            "advance risks (weather, holidays, visas, equipment), read-only team notes, and a one-call "
            "tour report. Backed by Qloo taste data; affinity signals, not ticket forecasts. "
            "Rate-limited public demo; read tour-intel://about for limits and privacy."
        ),
    )
else:
    mcp = MCPServer(
        "tour-intelligence-agent-tools",
        version="1.0.0",
        instructions=(
            "Read-only tools over the Agentic Tour & Promotion Intelligence OS's "
            "campaign, culture, fan-signal, and talent-brief data."
        ),
    )


def _identity_token(audience: str) -> str:
    """Same dual-path pattern as dashboard/server/index.js's
    getIdentityToken() and orchestration_driver/run_campaign.py's
    _auth_token(): the Cloud Run instance metadata server in production,
    falling back to an already-authenticated local gcloud session for local
    dev where no metadata server is reachable."""
    try:
        url = f"{_METADATA_SA_BASE}/identity?audience={urllib.parse.quote(audience, safe='')}"
        req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.read().decode().strip()
    except (urllib.error.URLError, OSError, TimeoutError):
        return subprocess.check_output(
            ["gcloud", "auth", "print-identity-token", "--audiences", audience]
        ).decode().strip()


def _get(path: str, params: dict | None = None) -> dict:
    token = _identity_token(TOUR_DATA_API)
    resp = requests.get(
        f"{TOUR_DATA_API}{path}", headers={"Authorization": f"Bearer {token}"}, params=params or {}, timeout=30
    )
    resp.raise_for_status()
    return resp.json()


def _post(path: str, payload: dict) -> dict:
    token = _identity_token(TOUR_DATA_API)
    resp = requests.post(
        f"{TOUR_DATA_API}{path}", headers={"Authorization": f"Bearer {token}"}, json=payload, timeout=30
    )
    resp.raise_for_status()
    return resp.json()


def _private_tool(fn):
    """Register a campaign tool; skipped in public mode (returns fn unchanged either way)."""
    return fn if PUBLIC else mcp.tool()(fn)


@_private_tool
def list_campaigns() -> dict:
    """List every tour campaign: title, genre, campaign type, and status."""
    return _get("/campaigns_list")


@_private_tool
def get_campaign(campaign_id: str) -> dict:
    """Get one campaign's title, genre, campaign type, talent roster, and status."""
    return _get("/campaigns", {"campaign_id": campaign_id})


@_private_tool
def get_campaign_stops(campaign_id: str) -> dict:
    """List a campaign's city stops in sequence order, with their dates."""
    return _get("/campaign_stops", {"campaign_id": campaign_id})


@_private_tool
def get_culture_notes(city_id: str) -> dict:
    """Get a city's press/fan etiquette guidance: greeting style, dos and donts, humor boundaries."""
    return _get("/culture_notes", {"city_id": city_id})


@_private_tool
def get_fan_signals(city_id: str, genre: str = "", artist_type: str = "") -> dict:
    """Get a city's raw fan-enthusiasm signal inputs, optionally scoped to a genre/artist type."""
    params: dict[str, str] = {"city_id": city_id}
    if genre:
        params["genre"] = genre
    if artist_type:
        params["artist_type"] = artist_type
    return _get("/fan_signals", params)


@_private_tool
def get_local_delight(city_id: str) -> dict:
    """Get a city's local delight content: phrases, cultural references, beloved icons."""
    return _get("/local_delight", {"city_id": city_id})


@_private_tool
def get_city_briefs(campaign_id: str, city_id: str = "") -> dict:
    """Get talent briefs (pending or finalized) for a campaign, optionally scoped to one city."""
    params: dict[str, str] = {"campaign_id": campaign_id}
    if city_id:
        params["city_id"] = city_id
    return _get("/city_briefs", params)


@_private_tool
def get_stop_safety_checklist(campaign_id: str, city_id: str) -> dict:
    """Get the planner-filled day-of-show safety checklist for one campaign stop:
    showstop manager assignment/name and venue capacity confirmation. Not
    AI-generated -- a manual record, null fields if nothing's been filled in yet."""
    return _get("/stop_safety_checklist", {"campaign_id": campaign_id, "city_id": city_id})


@_private_tool
def rank_cities(cities: list[dict]) -> dict:
    """Rank a list of cities by enthusiasm score and importance tier. Pure compute -- no data lookup, no side effects."""
    return _post("/rank_cities", {"cities": cities})


def public_session_id(ip: str) -> str:
    """Stable per-IP session id (hashed, so the IP never reaches the gateway)."""
    return "mcp-public-" + hashlib.sha256(ip.encode()).hexdigest()[:16]


def _request_ip() -> str:
    return _REQUEST_IP.get()


def _gw() -> dict:
    """Per-call gateway kwargs: a session id and an ID-token provider.
    Private mode: a fresh id per call. Public mode: one id per client IP, so the
    gateway's per-session budget applies per IP."""
    sid = public_session_id(_request_ip()) if PUBLIC else f"mcp-{uuid4().hex[:16]}"
    return {"session_id": sid, "token_fn": lambda: _identity_token(gateway_url())}


@mcp.tool()
def find_tour_markets(artist: str, regions: list[str], max_stops: int = 8) -> dict:
    """Score and rank touring markets for an artist in the given regions using Qloo
    taste data. Returns cities with a verdict plus fan heat, activation and
    winnability scores. Affinity signal only, not a ticket forecast. If the artist
    name is ambiguous, returns candidates to choose from instead."""
    extra = {"max_regions": PUBLIC_MAX_REGIONS} if PUBLIC else {}
    if PUBLIC:
        max_stops = min(max_stops, PUBLIC_MAX_STOPS) if isinstance(max_stops, int) else max_stops
    return taste_tools.find_tour_markets(artist, regions, max_stops, **extra, **_gw())


@mcp.tool()
def get_city_playbook(artist: str, city: str, country: str) -> dict:
    """Get a compact taste playbook for one artist in one city: each card's kind,
    status and its top three items with their affinity, share or lift."""
    return taste_tools.get_city_playbook(artist, city, country, **_gw())


@mcp.tool()
def suggest_support_acts(artist: str, city: str, country: str) -> dict:
    """Suggest support acts for an artist in a city. Each act shows shared taste,
    local affinity and their product as lift, so both factors are visible."""
    return taste_tools.suggest_support_acts(artist, city, country, **_gw())


@mcp.tool()
def rank_venues(artist: str, city: str, country: str, venues: list[str]) -> dict:
    """Rank up to 10 candidate venues in a city by taste fit with an artist's
    audience. Scores are comparable only within this one call."""
    return taste_tools.rank_venues(artist, city, country, venues, **_gw())


@mcp.tool()
def get_local_moment(artist: str, city: str, country: str) -> dict:
    """Get local cultural moments (events, scenes, places) in a city that fit an
    artist's audience, each with its type and affinity."""
    return taste_tools.get_local_moment(artist, city, country, **_gw())


@mcp.tool()
def get_sponsors_by_age(artist: str, city: str, country: str) -> dict:
    """Use when someone asks which brands fit an artist's younger or older fans in a city.
    Returns the age bands where the artist's fans over-index (index vs the average audience;
    not a share), each with the top 5 brands (fan rank, city rank, how many are new in the
    top 5 vs all fans). Age only. Affinity signal from aggregate taste data, not a ticket
    forecast; it is not evidence that any brand will sponsor."""
    return insight_tools.get_sponsors_by_age(artist, city, country, **_gw())


@mcp.tool()
def get_advance_risks(city: str, country: str, start_date: str, end_date: str, artist_country: str = "") -> dict:
    """Use when planning a stop and you need advance risks: typical weather for the dates,
    public holidays in the window, work-visa and equipment/customs notes (each with its source
    URL). Dates are YYYY-MM-DD, end on or after start, window at most 60 days. Weather is
    typical weather for these dates in past years, not a forecast. Pass artist_country for
    nationality-specific visa notes. Web-sourced; confirm before relying on it."""
    return insight_tools.get_advance_risks(city, country, start_date, end_date, artist_country, **_gw())


@mcp.tool()
def get_team_notes(workspace_link_or_id: str) -> dict:
    """Read a Tour Intelligence team workspace: city statuses, open threads (last 2 messages),
    resolved decisions, overrides next to the value Qloo suggested, sponsor leads and the last
    10 activity events. Accepts the full share link or the bare workspace id. Read-only.
    Anyone with the workspace link can read it; don't share links you don't want others to see.
    Entries marked "Demo teammate" are seeded demo content."""
    return insight_tools.get_team_notes(workspace_link_or_id, **_gw())


@mcp.tool()
def get_tour_report(artist: str, regions: list[str], max_stops: int = 3) -> dict:
    """One call, full report: scores markets in up to 2 regions (3 stops), then runs the
    playbook for the top Play / hidden-goldmine cities (at most 3) and returns structured JSON
    plus a ready-to-share `markdown` report (board table; per city top 3 sponsors, best venue,
    top co-billing act, top promo zone). Slow: about 1-3 minutes on a cold cache, and it counts
    as 3 requests against the per-IP rate limit. Use find_tour_markets / get_city_playbook for
    quick single questions. Affinity signal from aggregate taste data, not a ticket forecast.
    A failed city is skipped with a note instead of failing the report."""
    if PUBLIC and not LIMITER.allow(_request_ip(), weight=REPORT_WEIGHT - 1):
        raise RuntimeError("Rate limit reached — try again in a few minutes")
    extra = {"max_regions": PUBLIC_MAX_REGIONS, "max_cities": PUBLIC_MAX_STOPS} if PUBLIC else {}
    if PUBLIC and isinstance(max_stops, int) and not isinstance(max_stops, bool):
        max_stops = min(max_stops, PUBLIC_MAX_STOPS)
    return insight_tools.get_tour_report(artist, regions, max_stops, **extra, **_gw())


ABOUT = (
    "Tour Intelligence × Qloo — public MCP demo.\n\n"
    "What it does: helps a mid-tier artist's team pick tour markets and plan each stop using Qloo "
    "taste data: market board, city playbook (sponsors, co-billing, venues, promo zones, local "
    "moments), sponsors by age group, advance risks (weather, holidays, visas, equipment), "
    "read-only team notes, and a one-call report.\n\n"
    "Honest limits: every score is an affinity signal from aggregate taste data, not a ticket "
    "forecast and not a claim about individuals. Index values compare with the average audience "
    "and are not shares. Weather is typical for past years, not a forecast. Visa and equipment "
    "notes are web-sourced; confirm them. Nothing here shows that a brand or act has agreed to anything.\n\n"
    "Public demo limits: 2 regions and 3 stops per call, 30 requests per 10 minutes per client "
    "(get_tour_report counts as 3), a shared daily Qloo-call ceiling, and a 1-3 minute cold "
    "report. Results may come from recorded (cached) data rather than live calls.\n\n"
    "Privacy: no sign-in and no personal data stored by this server. Your IP is hashed to scope "
    "a rate-limit and budget session. Artist, city and region names you send go to the Qloo "
    "gateway. Team workspaces are readable by anyone holding the link.\n\n"
    "Proof and method: https://tour-intel-qloo.web.app/proof"
)


@mcp.resource("tour-intel://about", name="about", mime_type="text/plain",
              description="What this server does, its limits, privacy and the proof link.")
def about() -> str:
    return ABOUT


@mcp.prompt()
def plan_tour(artist: str, regions: str) -> str:
    """Plan a tour for an artist across up to 2 regions (comma-separated)."""
    return (
        f"Plan a tour for {artist} in: {regions}.\n"
        "1. Call find_tour_markets (max 2 regions, 3 stops). If it returns candidates, ask me which artist I mean and stop.\n"
        "2. For the top Play / hidden-goldmine cities (at most 3), call get_city_playbook; add get_sponsors_by_age for sponsor ideas "
        "and suggest_support_acts / rank_venues if I ask. If I want everything in one go, call get_tour_report instead (slow, 1-3 minutes).\n"
        "3. If I give dates, call get_advance_risks for each stop.\n"
        "Present honestly: scores are affinity signals from aggregate taste data, not ticket forecasts; age indexes are not shares of fans; "
        "weather is typical, not a forecast; never claim a brand or act has agreed to anything. Say when a city's data was missing or partial, "
        "and mention results may come from recorded rather than live data. Finish with a short ranked list and the next step."
    )


@mcp.prompt()
def brief_for_sponsor_meeting(artist: str, city: str, country: str) -> str:
    """Prepare a sponsor-meeting brief for one artist in one city."""
    return (
        f"Prepare a one-page sponsor-meeting brief for {artist} in {city}, {country}.\n"
        "1. Call get_city_playbook and read the sponsors card (fan rank vs city rank).\n"
        "2. Call get_sponsors_by_age and note which age group each brand fits; if there is no age skew, say so.\n"
        "3. Optionally call get_local_moment for a local hook and suggest_support_acts for a co-billing angle.\n"
        "Write: who the fans are (age bands as an index vs the average audience, never a percentage of fans), "
        "the 3 strongest brand fits with the lift wording (for example 'fans rank it #2; not in the city's top 20'), and a local hook. "
        "State that this is an affinity signal from aggregate taste data, not a ticket forecast or a sign that any brand will sponsor, "
        "and that no deal is implied. Do not invent brands or numbers that the tools did not return."
    )


# stateless_http=True: a streamable-http session tied to one server instance
# would break under Cloud Run's stateless autoscaling, which can route
# consecutive requests to different instances with no shared session state.
app = mcp.streamable_http_app(host="0.0.0.0", stateless_http=True)


def registered_tool_names() -> list[str]:
    import asyncio
    return [t.name for t in asyncio.run(mcp.list_tools())]


def client_ip(scope) -> str:
    """Right-most X-Forwarded-For entry: Cloud Run's frontend appends the real peer,
    so earlier entries are client-controlled and spoofable. Else the socket peer."""
    for k, v in scope.get("headers") or []:
        if k == b"x-forwarded-for":
            last = v.decode("latin-1").split(",")[-1].strip()
            if last:
                return last
    client = scope.get("client")
    return client[0] if client else "unknown"


class RateLimitMiddleware:
    """Pure ASGI middleware: per-IP sliding window, 429 when exceeded."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        ip = client_ip(scope)
        if not LIMITER.allow(ip):
            resp = JSONResponse({"error": "Rate limit reached — try again in a few minutes"}, status_code=429)
            return await resp(scope, receive, send)
        token = _REQUEST_IP.set(ip)
        try:
            await self.app(scope, receive, send)
        finally:
            _REQUEST_IP.reset(token)


if PUBLIC:
    app.add_middleware(RateLimitMiddleware)
