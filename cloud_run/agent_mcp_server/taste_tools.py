"""Five taste tools for external MCP clients, backed by the qloo_gateway.

Plain functions (registered with @mcp.tool() in main.py). Every Qloo request
goes through the gateway client, so its validation, cache and session budget
apply. Gateway failures surface as RuntimeError with a safe message."""

from __future__ import annotations

import re

import requests  # noqa: F401  (tests patch taste_tools.requests.post/get; same module gateway uses)

from gateway import GatewayError, call_tool, stream_events

_NAME = re.compile(r"[\w '.,&()-]{1,100}")
_INTEGRITY = "Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals."
_FORMULA = "lift = shared taste × local affinity"


def _check_name(label: str, value) -> str:
    stripped = value.strip(" ") if isinstance(value, str) else None
    if stripped is None or not _NAME.fullmatch(stripped):
        raise ValueError(f"{label} must be 1-100 characters: letters, digits, spaces and '.,&()-")
    return stripped


def _check_place(city, country) -> tuple[str, str]:
    return _check_name("city", city), _check_name("country", country)


def _candidates(env: dict) -> list[dict]:
    """Candidates from `issues` or the live `resolution.issues` shape."""
    resolution = env.get("resolution") if isinstance(env.get("resolution"), dict) else {}
    issues = env.get("issues") or resolution.get("issues") or []
    return [
        {"id": c.get("id"), "name": c.get("name")}
        for issue in issues if isinstance(issue, dict)
        for c in issue.get("candidates") or [] if isinstance(c, dict)
    ]


def _resolve_artist(artist: str, *, session_id: str, token_fn) -> dict:
    """Returns {"id", "name"} or an early-return dict with a "status" key."""
    env = call_tool("qloo_describe", {"entity": artist, "type": "artist"}, session_id=session_id, token_fn=token_fn)["envelope"]
    env = env if isinstance(env, dict) else {}
    status = env.get("status")
    if status == "needs_input":
        return {"status": "needs_input", "candidates": _candidates(env)}
    results = env.get("results")
    first = results[0] if isinstance(results, list) and results and isinstance(results[0], dict) else None
    if status == "error" or not first or not first.get("entity_id"):
        return {"status": "error", "message": "Could not find that artist in Qloo"}
    return {"id": first["entity_id"], "name": first.get("name") or artist}


def _guarded(fn):
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except GatewayError as err:
            raise RuntimeError(str(err)) from None
    wrapper.__name__ = fn.__name__
    wrapper.__doc__ = fn.__doc__
    return wrapper


def _val(metric) -> object:
    return metric.get("value") if isinstance(metric, dict) else None


@_guarded
def find_tour_markets(artist: str, regions: list[str], max_stops: int = 8, *, session_id: str, token_fn, max_regions: int = 6) -> dict:
    artist = _check_name("artist", artist)
    if not isinstance(regions, list) or not 1 <= len(regions) <= max_regions:
        raise ValueError(f"regions must have 1-{max_regions} items")
    regions = [_check_name("region", r) for r in regions]
    if not isinstance(max_stops, int) or isinstance(max_stops, bool) or not 1 <= max_stops <= 20:
        raise ValueError("max_stops must be between 1 and 20")
    who = _resolve_artist(artist, session_id=session_id, token_fn=token_fn)
    if "status" in who:
        return who
    events = stream_events(
        "/v1/tour-board", method="POST",
        body={"artist": who["name"], "artistEntityId": who["id"], "regions": regions, "maxStops": max_stops},
        session_id=session_id, token_fn=token_fn,
    )
    cities = []
    requests_made = 0
    error = None
    finished = False
    for ev in events:
        t = ev.get("type")
        if t == "tool_result":
            requests_made += 1
        elif t == "city_scored" and isinstance(ev.get("city"), dict):
            c = ev["city"]
            cities.append({
                "name": c.get("name"), "country": c.get("country"), "verdict": c.get("verdict"),
                "fan_heat": _val(c.get("fanHeat")), "activation": _val(c.get("activation")), "winnability": _val(c.get("winnability")),
            })
        elif t == "done":
            finished = True
        elif t == "error":
            error = ev
            finished = True
    if error and not cities and error.get("code") != "BUDGET":
        return {"status": "error", "message": "Qloo gateway could not score markets"}
    return {
        "status": "ok" if finished and not error else "partial",
        "artist": {"id": who["id"], "name": who["name"]},
        "cities": cities[:max_stops],
        "qloo_requests": requests_made,
        "integrity": _INTEGRITY,
    }


def _playbook_cards(artist: str, city: str, country: str, *, session_id: str, token_fn):
    """Returns (artist_dict, cards) or (early_return_dict, None)."""
    artist = _check_name("artist", artist)
    city, country = _check_place(city, country)
    who = _resolve_artist(artist, session_id=session_id, token_fn=token_fn)
    if "status" in who:
        return who, None
    events = stream_events(
        "/v1/city-playbook",
        params={"artist": who["name"], "artistEntityId": who["id"], "city": city, "country": country, "narrative": "0"},
        session_id=session_id, token_fn=token_fn,
    )
    for ev in events:
        if ev.get("type") == "error":
            raise RuntimeError("Qloo gateway could not build the playbook")
        if ev.get("type") == "playbook" and isinstance(ev.get("playbook"), dict):
            cards = ev["playbook"].get("cards")
            return who, cards if isinstance(cards, list) else []
    raise RuntimeError("Qloo gateway returned no playbook")


def _card_items(cards: list, kind: str) -> list[dict]:
    for c in cards:
        if isinstance(c, dict) and c.get("kind") == kind:
            return [i for i in c.get("items") or [] if isinstance(i, dict)]
    return []


@_guarded
def get_city_playbook(artist: str, city: str, country: str, *, session_id: str, token_fn) -> dict:
    who, cards = _playbook_cards(artist, city, country, session_id=session_id, token_fn=token_fn)
    if cards is None:
        return who
    compact = []
    for c in cards:
        if not isinstance(c, dict):
            continue
        top = []
        for it in (c.get("items") or [])[:3]:
            o = it if isinstance(it, dict) else {}
            entry = {"name": str(o.get("name") or o.get("label") or "")[:100]}
            for k in ("affinity", "share", "lift"):
                if o.get(k) is not None:
                    entry[k] = o[k]
                    break
            top.append(entry)
        compact.append({"kind": c.get("kind"), "status": c.get("status"), "top": top})
    return {"status": "ok", "artist": who, "city": city, "country": country, "cards": compact, "integrity": _INTEGRITY}


@_guarded
def suggest_support_acts(artist: str, city: str, country: str, *, session_id: str, token_fn) -> dict:
    who, cards = _playbook_cards(artist, city, country, session_id=session_id, token_fn=token_fn)
    if cards is None:
        return who
    acts = [
        {"name": i.get("name"), "shared_taste": i.get("sharedTaste"), "local_affinity": i.get("localAffinity"),
         "lift": i.get("lift"), "shared_tags": i.get("sharedTags") if isinstance(i.get("sharedTags"), list) else []}
        for i in _card_items(cards, "co_billing")
    ]
    return {"status": "ok", "artist": who, "acts": acts, "formula": _FORMULA, "integrity": _INTEGRITY}


@_guarded
def get_local_moment(artist: str, city: str, country: str, *, session_id: str, token_fn) -> dict:
    who, cards = _playbook_cards(artist, city, country, session_id=session_id, token_fn=token_fn)
    if cards is None:
        return who
    moments = [{"name": i.get("name"), "category": i.get("category"), "affinity": i.get("affinity")} for i in _card_items(cards, "local_moment")]
    return {"status": "ok", "artist": who, "moments": moments, "integrity": _INTEGRITY}


_PLACE_KEYS = {"address", "locality", "city", "neighborhood", "region", "geocode", "location"}


def _place_text(node, depth=0) -> list[str]:
    """Strings under address-like keys of a describe result (name is deliberately excluded)."""
    out: list[str] = []
    if depth > 3 or not isinstance(node, dict):
        return out
    for k, v in node.items():
        if k == "properties":
            out += _place_text(v, depth + 1)
        elif k in _PLACE_KEYS:
            if isinstance(v, str):
                out.append(v)
            elif isinstance(v, dict):
                out += [s for s in (x for x in v.values()) if isinstance(s, str)]
    return out


def _in_city(entity: dict, city: str) -> bool:
    return any(city.lower() in text.lower() for text in _place_text(entity))


@_guarded
def rank_venues(artist: str, city: str, country: str, venues: list[str], *, session_id: str, token_fn) -> dict:
    artist = _check_name("artist", artist)
    city, country = _check_place(city, country)
    if not isinstance(venues, list) or not 1 <= len(venues) <= 10:
        raise ValueError("venues must have 1-10 items")
    venues = [_check_name("venue", v) for v in venues]
    who = _resolve_artist(artist, session_id=session_id, token_fn=token_fn)
    if "status" in who:
        return who
    ids: dict[str, str] = {}  # entity id -> the venue name the caller gave
    unresolved: list[str] = []
    candidates: list[dict] = []
    for venue in venues:
        text = f"{venue} {city}"
        d = call_tool("qloo_describe", {"entity": text if len(text) <= 100 else venue, "type": "place"},
                      session_id=session_id, token_fn=token_fn)["envelope"]
        d = d if isinstance(d, dict) else {}
        results = d.get("results")
        first = results[0] if isinstance(results, list) and results and isinstance(results[0], dict) else None
        if d.get("status") == "ok" and first and first.get("entity_id") and first["entity_id"] not in ids and _in_city(first, city):
            ids[first["entity_id"]] = venue
        else:
            unresolved.append(venue)  # ambiguous or unknown: never guess between candidates
            candidates += _candidates(d)
    if not ids:
        return {"status": "needs_input", "candidates": candidates, "unresolved": unresolved}
    env = call_tool(
        "qloo_rank",
        {"options": list(ids), "option_type": "place", "signals": [who["id"]], "signal_location": f"{city}, {country}"},
        session_id=session_id, token_fn=token_fn,
    )["envelope"]
    env = env if isinstance(env, dict) else {}
    if env.get("status") == "needs_input":
        return {"status": "needs_input", "candidates": _candidates(env), "unresolved": unresolved}
    if env.get("status") == "error":
        return {"status": "error", "message": "Qloo could not rank those venues"}
    ranked = [
        {"name": ids.get(str(r.get("entity_id") or r.get("id")), r.get("name")), "affinity": r.get("affinity")}
        for r in env.get("results") or [] if isinstance(r, dict)
    ]
    return {"status": "ok", "artist": who, "ranked": ranked, "unresolved": unresolved,
            "note": "Affinity is comparable only within this call", "integrity": _INTEGRITY}
