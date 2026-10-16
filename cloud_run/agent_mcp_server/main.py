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

import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4

import requests
from mcp.server.mcpserver import MCPServer

# Load sibling modules relative to this file, regardless of cwd or how main was imported.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import taste_tools  # noqa: E402
from gateway import gateway_url  # noqa: E402

# No default URL: the original Google-hackathon service must never be hit by accident.
TOUR_DATA_API = os.environ.get("TOUR_DATA_API_URL", "")
if not TOUR_DATA_API:
    raise RuntimeError("TOUR_DATA_API_URL is not set; refusing to start without this project's tour_data_api URL")
_METADATA_SA_BASE = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default"

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


@mcp.tool()
def list_campaigns() -> dict:
    """List every tour campaign: title, genre, campaign type, and status."""
    return _get("/campaigns_list")


@mcp.tool()
def get_campaign(campaign_id: str) -> dict:
    """Get one campaign's title, genre, campaign type, talent roster, and status."""
    return _get("/campaigns", {"campaign_id": campaign_id})


@mcp.tool()
def get_campaign_stops(campaign_id: str) -> dict:
    """List a campaign's city stops in sequence order, with their dates."""
    return _get("/campaign_stops", {"campaign_id": campaign_id})


@mcp.tool()
def get_culture_notes(city_id: str) -> dict:
    """Get a city's press/fan etiquette guidance: greeting style, dos and donts, humor boundaries."""
    return _get("/culture_notes", {"city_id": city_id})


@mcp.tool()
def get_fan_signals(city_id: str, genre: str = "", artist_type: str = "") -> dict:
    """Get a city's raw fan-enthusiasm signal inputs, optionally scoped to a genre/artist type."""
    params: dict[str, str] = {"city_id": city_id}
    if genre:
        params["genre"] = genre
    if artist_type:
        params["artist_type"] = artist_type
    return _get("/fan_signals", params)


@mcp.tool()
def get_local_delight(city_id: str) -> dict:
    """Get a city's local delight content: phrases, cultural references, beloved icons."""
    return _get("/local_delight", {"city_id": city_id})


@mcp.tool()
def get_city_briefs(campaign_id: str, city_id: str = "") -> dict:
    """Get talent briefs (pending or finalized) for a campaign, optionally scoped to one city."""
    params: dict[str, str] = {"campaign_id": campaign_id}
    if city_id:
        params["city_id"] = city_id
    return _get("/city_briefs", params)


@mcp.tool()
def get_stop_safety_checklist(campaign_id: str, city_id: str) -> dict:
    """Get the planner-filled day-of-show safety checklist for one campaign stop:
    showstop manager assignment/name and venue capacity confirmation. Not
    AI-generated -- a manual record, null fields if nothing's been filled in yet."""
    return _get("/stop_safety_checklist", {"campaign_id": campaign_id, "city_id": city_id})


@mcp.tool()
def rank_cities(cities: list[dict]) -> dict:
    """Rank a list of cities by enthusiasm score and importance tier. Pure compute -- no data lookup, no side effects."""
    return _post("/rank_cities", {"cities": cities})


def _gw() -> dict:
    """Per-call gateway kwargs: a private session id and an ID-token provider."""
    return {"session_id": f"mcp-{uuid4().hex[:16]}", "token_fn": lambda: _identity_token(gateway_url())}


@mcp.tool()
def find_tour_markets(artist: str, regions: list[str], max_stops: int = 8) -> dict:
    """Score and rank touring markets for an artist in the given regions using Qloo
    taste data. Returns cities with a verdict plus fan heat, activation and
    winnability scores. Affinity signal only, not a ticket forecast. If the artist
    name is ambiguous, returns candidates to choose from instead."""
    return taste_tools.find_tour_markets(artist, regions, max_stops, **_gw())


@mcp.tool()
def get_city_playbook(artist: str, city: str, country: str) -> dict:
    """Get a compact taste playbook for one artist in one city: each card's kind,
    status and its top three items with their affinity, share or lift."""
    return taste_tools.get_city_playbook(artist, city, country, **_gw())


@mcp.tool()
def suggest_support_acts(artist: str, city: str, country: str) -> dict:
    """Suggest support acts for an artist in a city. Each act shows audience overlap,
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


# stateless_http=True: a streamable-http session tied to one server instance
# would break under Cloud Run's stateless autoscaling, which can route
# consecutive requests to different instances with no shared session state.
app = mcp.streamable_http_app(host="0.0.0.0", stateless_http=True)
