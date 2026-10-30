"""Tests for the four insight tools, with the gateway mocked at the requests layer (no network)."""
import json
from unittest.mock import MagicMock

import pytest

import insight_tools
import taste_tools

KW = {"session_id": "mcp-test", "token_fn": lambda: "tok"}
DESCRIBE = {"envelope": {"status": "ok", "results": [{"entity_id": "Q1", "name": "Lumen Vale"}]}}
WS = "AbCdEfGh12345678"


def _sse(*events):
    lines = []
    for e in events:
        lines += [f"event: {e['type']}", f"data: {json.dumps(e)}", ""]
    return lines


def _resp(status=200, lines=None, payload=None):
    r = MagicMock(status_code=status)
    r.iter_lines.return_value = lines or []
    r.json.return_value = payload if payload is not None else {}
    r.__enter__ = lambda s: s
    r.__exit__ = lambda s, *a: False
    return r


def _gateway(monkeypatch, routes):
    """routes: {path-suffix: callable(params_or_body) -> response}. Records every call in the returned list."""
    calls = []

    def handler(method):
        def fn(url, **kw):
            path = url.split(".test", 1)[1]
            calls.append((method, path, kw.get("params") or kw.get("json")))
            for suffix, make in routes.items():
                if path.startswith(suffix):
                    return make(kw.get("params") or kw.get("json"))
            raise AssertionError(f"unexpected gateway call {method} {path}")
        return fn

    monkeypatch.setattr(taste_tools.requests, "post", handler("POST"))
    monkeypatch.setattr(taste_tools.requests, "get", handler("GET"))
    return calls


# ------------------------------------------------------------ get_sponsors_by_age

SEGMENTS = {"status": "ok", "indexes": {"24_and_younger": 0.6}, "bands": [
    {"band": "24_and_younger", "phrase": "18-24", "index": 0.62, "status": "ok", "hiddenCount": 1, "newInTop5": 2, "lifted": True,
     "items": [{"name": f"Brand{i}", "entityId": f"B{i}", "artistRank": i + 1, "cityRank": None if i == 0 else 7} for i in range(7)]}]}


def test_sponsors_by_age_compact_bands(monkeypatch):
    calls = _gateway(monkeypatch, {"/v1/tools/": lambda b: _resp(payload=DESCRIBE), "/v1/sponsor-segments": lambda p: _resp(payload=SEGMENTS)})
    out = insight_tools.get_sponsors_by_age("Lumen Vale", "Guadalajara", "MX", **KW)
    assert out["status"] == "ok" and out["age_only"] is True
    band = out["bands"][0]
    assert band["band"] == "18-24" and band["index"] == 0.62 and "not a share" in band["index_note"]
    assert len(band["brands"]) == 5 and band["new_in_top5"] == 2
    assert band["brands"][0] == {"name": "Brand0", "fan_rank": 1, "city_rank": None, "lift": "fans rank it #1; not in the city's top 20"}
    assert band["brands"][1]["lift"] == "fans rank it #2; city rank #7"
    assert "not a ticket forecast" in out["integrity"]
    seg = next(c for c in calls if c[1].startswith("/v1/sponsor-segments"))
    assert seg[2] == {"artistId": "Q1", "city": "Guadalajara", "country": "MX"}


def test_sponsors_by_age_unlifted_band_makes_no_lift_claim(monkeypatch):
    seg = {"status": "ok", "indexes": {}, "bands": [{"band": "25_to_29", "phrase": "25-29", "index": 0.4, "status": "ok", "lifted": False, "newInTop5": None,
                                                    "items": [{"name": "A", "entityId": "A", "artistRank": 1, "cityRank": None}]}]}
    _gateway(monkeypatch, {"/v1/tools/": lambda b: _resp(payload=DESCRIBE), "/v1/sponsor-segments": lambda p: _resp(payload=seg)})
    b = insight_tools.get_sponsors_by_age("Lumen Vale", "Guadalajara", "MX", **KW)["bands"][0]
    assert "lift" not in b["brands"][0] and b["brands"][0]["city_rank"] is None and b["new_in_top5_note"] is None


@pytest.mark.parametrize("payload,status", [({"status": "no_skew", "indexes": {}, "bands": []}, "no_skew"),
                                            ({"status": "unavailable", "reason": "budget", "message": "Qloo limit reached for now", "bands": []}, "unavailable")])
def test_sponsors_by_age_other_statuses(monkeypatch, payload, status):
    _gateway(monkeypatch, {"/v1/tools/": lambda b: _resp(payload=DESCRIBE), "/v1/sponsor-segments": lambda p: _resp(payload=payload)})
    out = insight_tools.get_sponsors_by_age("Lumen Vale", "Guadalajara", "MX", **KW)
    assert out["status"] == status and out["bands"] == [] if status == "no_skew" else out["reason"] == "budget"


def test_sponsors_by_age_needs_input_and_validation(monkeypatch):
    amb = {"envelope": {"status": "needs_input", "issues": [{"candidates": [{"id": "A", "name": "Lumen"}]}]}}
    _gateway(monkeypatch, {"/v1/tools/": lambda b: _resp(payload=amb)})
    assert insight_tools.get_sponsors_by_age("Lumen", "Guadalajara", "MX", **KW) == {"status": "needs_input", "candidates": [{"id": "A", "name": "Lumen"}]}
    with pytest.raises(ValueError):
        insight_tools.get_sponsors_by_age("Lumen Vale", "<x>", "MX", **KW)


# ------------------------------------------------------------ get_advance_risks

ADVANCE = {
    "weather": {"status": "ok", "source": "Open-Meteo", "sourceUrl": "https://open-meteo.com/en/docs/historical-weather-api", "years": [2023, 2024, 2025], "days": 9,
                "tempMaxC": {"mean": 28.4, "min": 22.0, "max": 33.1}, "tempMinC": {"mean": 15.2}, "rainDaysShare": 0.33, "note": "x"},
    "holidays": {"status": "ok", "source": "Nager.Date", "sourceUrl": "https://date.nager.at/", "items": [{"date": "2026-11-02", "name": "All Souls", "localName": "Dia", "near": True}]},
    "visa": {"status": "ok", "summary": "Work visa needed.", "leadTime": "6 weeks", "items": [{"text": "Apply 6 weeks ahead.", "sourceUrl": "https://example.org/visa"}], "sources": [], "cached": False},
    "equipment": {"status": "capped", "message": "Web lookups are paused for today."},
    "generatedAt": "2026-10-30T00:00:00Z",
}


def test_advance_risks_compact_shape_and_params(monkeypatch):
    calls = _gateway(monkeypatch, {"/v1/advance": lambda p: _resp(payload=ADVANCE)})
    out = insight_tools.get_advance_risks("Guadalajara", "MX", "2026-11-01", "2026-11-09", "US", **KW)
    assert calls[0][2] == {"city": "Guadalajara", "country": "MX", "start": "2026-11-01", "end": "2026-11-09", "artistCountry": "US"}
    assert "not a forecast" in out["weather"]["label"] and out["weather"]["typical_high_c"] == 28.4 and out["weather"]["years"] == [2023, 2024, 2025]
    assert out["holidays"]["items"] == [{"date": "2026-11-02", "name": "All Souls", "near_window": True}]
    assert out["visa"]["items"][0] == {"text": "Apply 6 weeks ahead.", "source_url": "https://example.org/visa"}
    assert out["visa"]["lead_time"] == "6 weeks"
    assert out["equipment"] == {"status": "capped", "message": "Web lookups are paused for today.", "sources": []}


def test_advance_risks_omits_artist_country_when_blank(monkeypatch):
    calls = _gateway(monkeypatch, {"/v1/advance": lambda p: _resp(payload=ADVANCE)})
    insight_tools.get_advance_risks("Guadalajara", "MX", "2026-11-01", "2026-11-01", **KW)
    assert "artistCountry" not in calls[0][2]


@pytest.mark.parametrize("s,e", [("2026/11/01", "2026-11-09"), ("2026-11-09", "2026-11-01"), ("2026-02-30", "2026-03-02"),
                                 ("2026-01-01", "2026-03-05"), ("", "2026-11-09"), (None, "2026-11-09")])
def test_advance_risks_rejects_bad_windows(monkeypatch, s, e):
    _gateway(monkeypatch, {})
    with pytest.raises(ValueError):
        insight_tools.get_advance_risks("Guadalajara", "MX", s, e, **KW)


def test_advance_risks_allows_exactly_sixty_days(monkeypatch):
    _gateway(monkeypatch, {"/v1/advance": lambda p: _resp(payload=ADVANCE)})
    assert insight_tools.get_advance_risks("Guadalajara", "MX", "2026-01-01", "2026-03-02", **KW)["status"] == "ok"


# ------------------------------------------------------------ get_team_notes

def _snap():
    return {"ws": WS, "rev": 5, "createdAt": 1, "statuses": {"gdl": {"status": "considering", "name": "Ana", "role": "Manager", "at": 9, "demo": True}},
            "threads": {
                "city:gdl": {"resolved": False, "messages": [{"id": f"m{i}", "name": "Ana", "role": "Manager", "text": f"note {i}", "at": i} for i in range(4)]},
                "tour:budget": {"resolved": True, "resolvedBy": {"name": "Bo", "role": "Promoter"}, "resolvedAt": 7,
                                "messages": [{"id": "m9", "name": "Bo", "role": "Promoter", "text": "Go with Arena", "at": 6, "demo": True}]}},
            "overrides": {"gdl": {"best_room": {"value": "Arena", "original": "Teatro", "name": "Bo", "role": "Promoter", "at": 8}}},
            "leads": {"gdl": [{"id": "l1", "text": "Call Brand0", "name": "Cy", "role": "Brand team", "at": 3, "demo": True}]},
            "activity": [{"id": f"a{i}", "type": "message", "key": "city:gdl", "text": f"t{i}", "name": "Ana", "role": "Manager", "at": 100 - i} for i in range(15)]}


@pytest.mark.parametrize("value", [WS, f"https://tour-intel-qloo.web.app/?ws={WS}", f"https://tour-intel-qloo.web.app/tour?x=1&ws={WS}#top",
                                   f"https://tour-intel-qloo.web.app/#ws={WS}", f"  {WS}  ", f"?ws={WS}"])
def test_extract_ws_id_accepts_links_and_bare_ids(value):
    assert insight_tools.extract_ws_id(value) == WS


@pytest.mark.parametrize("value", ["", "short", "https://x.app/?other=1", "https://x.app/?ws=../../etc/passwd", "a/b/c/d/e/f/g/h/i/j", None, 42, "x" * 600])
def test_extract_ws_id_rejects_bad_input(value):
    with pytest.raises(ValueError):
        insight_tools.extract_ws_id(value)


def test_team_notes_shape(monkeypatch):
    calls = _gateway(monkeypatch, {f"/v1/ws/{WS}": lambda p: _resp(payload=_snap())})
    out = insight_tools.get_team_notes(f"https://tour-intel-qloo.web.app/?ws={WS}", **KW)
    assert calls == [("GET", f"/v1/ws/{WS}", {})] or calls[0][:2] == ("GET", f"/v1/ws/{WS}")
    assert out["read_only"] is True and out["status"] == "ok"
    assert out["city_statuses"][0]["status"] == "considering" and out["city_statuses"][0]["marking"] == "Demo teammate"
    t = out["open_threads"][0]
    assert t["thread"] == "city:gdl" and [m["text"] for m in t["last_messages"]] == ["note 2", "note 3"] and "marking" not in t["last_messages"][0]
    r = out["resolved_decisions"][0]
    assert r["resolved_by"] == "Bo" and r["decision"]["text"] == "Go with Arena" and r["decision"]["marking"] == "Demo teammate"
    assert out["overrides"][0]["value"] == "Arena" and out["overrides"][0]["qloo_suggested"] == "Teatro"
    assert out["sponsor_leads"][0]["marking"] == "Demo teammate"
    assert len(out["recent_activity"]) == 10 and out["recent_activity"][0]["text"] == "t0"


def test_team_notes_unknown_workspace_is_a_clean_not_found(monkeypatch):
    _gateway(monkeypatch, {"/v1/ws/": lambda p: _resp(status=404)})
    out = insight_tools.get_team_notes(WS, **KW)
    assert out["status"] == "not_found" and "expired" in out["message"]


def test_team_notes_is_read_only_get(monkeypatch):
    calls = _gateway(monkeypatch, {"/v1/ws/": lambda p: _resp(payload=_snap())})
    insight_tools.get_team_notes(WS, **KW)
    assert {c[0] for c in calls} == {"GET"}


def test_team_notes_gateway_failure_is_safe(monkeypatch):
    _gateway(monkeypatch, {"/v1/ws/": lambda p: _resp(status=500)})
    with pytest.raises(RuntimeError, match="Qloo gateway unavailable"):
        insight_tools.get_team_notes(WS, **KW)


# ------------------------------------------------------------ get_tour_report

def _city(name, country, verdict, fh=60, ac=70, wi=80):
    return {"type": "city_scored", "city": {"name": name, "country": country, "verdict": verdict,
                                            "fanHeat": {"value": fh}, "activation": {"value": ac}, "winnability": {"value": wi}}}


BOARD = _sse({"type": "tool_result"}, _city("Guadalajara", "MX", "hidden_goldmine"), _city("Monterrey", "MX", "play"),
             _city("Leon | Gto", "MX", "play"), {"type": "done"})


def _playbook(city, with_dnb=True, narrative=False):
    co = [{"name": "Ariel Pink", "sharedTaste": 0.9, "sharedTags": ["lofi"], "lift": 0.8}] if with_dnb else []
    co.append({"name": f"Bruma {city}", "sharedTaste": 0.34, "sharedTags": ["dream pop", "shoegaze"], "lift": 0.29})
    cards = [
        {"kind": "sponsors", "status": "ok", "items": [{"name": f"S{i}", "artistRank": i + 1, "cityRank": None if i == 0 else 4} for i in range(5)]},
        {"kind": "venue_fit", "status": "ok", "items": [{"name": "Small Room", "affinity": 0.3}, {"name": "Big Arena", "affinity": 0.8}]},
        {"kind": "co_billing", "status": "ok", "items": co},
        {"kind": "promo_zones", "status": "ok", "items": [{"label": "Centro", "share": 0.2}, {"label": "Chapultepec", "share": 0.41}]},
    ]
    evs = [{"type": "playbook", "playbook": {"cards": cards}}]
    if narrative:
        evs.append({"type": "narrative", "narrative": {"status": "ok", "cards": {"sponsors": {"verified": [1, 2, 3], "removed": [1]}, "venue_fit": {"verified": [1], "removed": []}}}})
    return _sse(*evs, {"type": "done"})


def _report_routes(monkeypatch, fail_city=None, narrative=False):
    def playbook(p):
        if p["city"] == fail_city:
            return _resp(status=502)
        return _resp(lines=_playbook(p["city"], narrative=narrative))
    return _gateway(monkeypatch, {"/v1/tools/": lambda b: _resp(payload=DESCRIBE), "/v1/tour-board": lambda b: _resp(lines=BOARD), "/v1/city-playbook": playbook})


def test_tour_report_structure_and_markdown(monkeypatch):
    calls = _report_routes(monkeypatch, narrative=True)
    out = insight_tools.get_tour_report("Lumen Vale", ["Mexico"], 3, today="2026-10-30", **KW)
    assert out["status"] == "ok"
    # one artist resolution only, one board, playbooks for Play/hidden_goldmine only (max 3)
    assert sum(1 for c in calls if c[1].startswith("/v1/tools/")) == 1
    assert sorted(c[2]["city"] for c in calls if c[1] == "/v1/city-playbook") == ["Guadalajara", "Leon | Gto", "Monterrey"]
    assert [c["name"] for c in out["cities"]] == ["Guadalajara", "Monterrey", "Leon | Gto"]
    c = out["cities"][0]
    assert len(c["sponsors"]) == 3 and c["sponsors"][0]["lift"] == "fans rank it #1; not in the city's top 20"
    assert c["best_venue"]["name"] == "Big Arena"
    assert c["top_support_act"]["name"] == "Bruma Guadalajara" and c["top_support_act"]["shared_tags"] == ["dream pop", "shoegaze"]
    assert c["top_promo_zone"]["name"] == "Chapultepec"
    assert c["claims"] == "4 verified · 1 removed" and c["hidden_acts"] == 1
    md = out["markdown"]
    assert md.startswith("# Tour report: Lumen Vale") and "2026-10-30" in md
    assert "not a ticket forecast" in md
    assert "| City | Verdict | Fan heat | Activation | Winnability |" in md
    assert "| Guadalajara, MX | Hidden goldmine | 60 | 70 | 80 |" in md
    assert "Leon / Gto" in md  # pipe escaped in table cells
    assert "fans rank it #1; not in the city's top 20" in md and "Big Arena" in md and "Bruma Guadalajara" in md and "Chapultepec" in md
    assert "4 verified · 1 removed" in md
    assert md.rstrip().endswith("Generated by Tour Intelligence × Qloo — https://tour-intel-qloo.web.app")


def test_tour_report_never_shows_do_not_book_acts(monkeypatch):
    _report_routes(monkeypatch)
    out = insight_tools.get_tour_report("Lumen Vale", ["Mexico"], 3, **KW)
    assert "Ariel Pink" not in out["markdown"] and "Ariel Pink" not in json.dumps(out)
    assert "hidden by our do-not-book list" in out["markdown"]


def test_tour_report_omits_claims_when_gateway_sends_no_narrative(monkeypatch):
    _report_routes(monkeypatch)
    out = insight_tools.get_tour_report("Lumen Vale", ["Mexico"], 3, **KW)
    assert "claims" not in out["cities"][0] and "verified" not in out["markdown"]


def test_tour_report_skips_non_play_verdicts(monkeypatch):
    board = _sse(_city("Puebla", "MX", "skip"), _city("Toluca", "MX", "de_risk"), _city("Monterrey", "MX", "play"), {"type": "done"})
    calls = _gateway(monkeypatch, {"/v1/tools/": lambda b: _resp(payload=DESCRIBE), "/v1/tour-board": lambda b: _resp(lines=board),
                                   "/v1/city-playbook": lambda p: _resp(lines=_playbook(p["city"]))})
    out = insight_tools.get_tour_report("Lumen Vale", ["Mexico"], 3, **KW)
    assert [c["name"] for c in out["cities"]] == ["Monterrey"]
    assert [c[2]["city"] for c in calls if c[1] == "/v1/city-playbook"] == ["Monterrey"]
    assert "| Puebla, MX | Skip |" in out["markdown"]


def test_tour_report_caps_cities_by_max_stops(monkeypatch):
    calls = _report_routes(monkeypatch)
    out = insight_tools.get_tour_report("Lumen Vale", ["Mexico"], 1, **KW)
    assert len(out["cities"]) == 1
    assert [c[2]["maxStops"] for c in calls if c[1] == "/v1/tour-board"] == [1]


def test_tour_report_never_exceeds_max_cities_whatever_max_stops_asks(monkeypatch):
    board = _sse(*[_city(f"City{i}", "MX", "play") for i in range(5)], {"type": "done"})
    calls = _gateway(monkeypatch, {"/v1/tools/": lambda b: _resp(payload=DESCRIBE), "/v1/tour-board": lambda b: _resp(lines=board),
                                   "/v1/city-playbook": lambda p: _resp(lines=_playbook(p["city"]))})
    out = insight_tools.get_tour_report("Lumen Vale", ["Mexico"], 10, max_cities=3, **KW)
    assert [c[2]["maxStops"] for c in calls if c[1] == "/v1/tour-board"] == [3]
    assert len(out["cities"]) == 3
    assert len([c for c in calls if c[1] == "/v1/city-playbook"]) == 3


def test_tour_report_returns_partial_when_a_city_fails(monkeypatch):
    _report_routes(monkeypatch, fail_city="Monterrey")
    out = insight_tools.get_tour_report("Lumen Vale", ["Mexico"], 3, **KW)
    assert out["status"] == "partial"
    bad = next(c for c in out["cities"] if c["name"] == "Monterrey")
    assert "unavailable" in bad["error"]
    assert any("Monterrey" in n for n in out["notes"]) and "Playbook unavailable" in out["markdown"]
    assert next(c for c in out["cities"] if c["name"] == "Guadalajara")["sponsors"]


def test_tour_report_with_no_playable_city_still_returns_the_board(monkeypatch):
    board = _sse(_city("Puebla", "MX", "skip"), {"type": "done"})
    _gateway(monkeypatch, {"/v1/tools/": lambda b: _resp(payload=DESCRIBE), "/v1/tour-board": lambda b: _resp(lines=board)})
    out = insight_tools.get_tour_report("Lumen Vale", ["Mexico"], 3, **KW)
    assert out["cities"] == [] and "Puebla" in out["markdown"] and any("No Play" in n for n in out["notes"])


def test_tour_report_validation_and_needs_input(monkeypatch):
    with pytest.raises(ValueError):
        insight_tools.get_tour_report("Lumen Vale", ["A", "B", "C"], 3, **KW)
    with pytest.raises(ValueError):
        insight_tools.get_tour_report("Lumen Vale", ["A"], 0, **KW)
    amb = {"envelope": {"status": "needs_input", "issues": [{"candidates": [{"id": "A", "name": "Lumen"}]}]}}
    _gateway(monkeypatch, {"/v1/tools/": lambda b: _resp(payload=amb)})
    assert insight_tools.get_tour_report("Lumen", ["Mexico"], 3, **KW)["status"] == "needs_input"


# ------------------------------------------------------------ do-not-book in the existing tools

def test_do_not_book_list_matches_dashboard():
    import os, re
    src = open(os.path.join(os.path.dirname(__file__), "..", "..", "..", "dashboard", "src", "lib", "qloo", "doNotBook.ts"), encoding="utf-8").read()
    listed = re.search(r"DO_NOT_BOOK: readonly string\[\] = \[(.*?)\]", src).group(1)
    assert re.findall(r'"([^"]+)"', listed) == taste_tools.DO_NOT_BOOK


def test_suggest_support_acts_filters_do_not_book(monkeypatch):
    pb = _sse({"type": "playbook", "playbook": {"cards": [{"kind": "co_billing", "status": "ok", "items": [
        {"name": "ARIEL  pínk", "lift": 1}, {"name": "Ariel Pink", "lift": 1}, {"name": "Bruma", "lift": 0.2}]}]}}, {"type": "done"})
    _gateway(monkeypatch, {"/v1/tools/": lambda b: _resp(payload=DESCRIBE), "/v1/city-playbook": lambda p: _resp(lines=pb)})
    out = taste_tools.suggest_support_acts("Lumen Vale", "Guadalajara", "MX", **KW)
    assert [a["name"] for a in out["acts"]] == ["Bruma"]
