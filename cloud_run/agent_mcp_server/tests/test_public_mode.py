import importlib.util
import os
import sys

import pytest

_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="module")
def public_main():
    saved = {k: os.environ.get(k) for k in ("MCP_PUBLIC", "TOUR_DATA_API_URL")}
    os.environ["MCP_PUBLIC"] = "1"
    os.environ.pop("TOUR_DATA_API_URL", None)
    try:
        spec = importlib.util.spec_from_file_location("agent_mcp_server_main_public", os.path.join(_SERVICE_DIR, "main.py"))
        mod = importlib.util.module_from_spec(spec)
        sys.modules["agent_mcp_server_main_public"] = mod
        spec.loader.exec_module(mod)
        yield mod
    finally:
        sys.modules.pop("agent_mcp_server_main_public", None)
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def test_public_mode_registers_only_taste_tools(public_main):
    assert set(public_main.registered_tool_names()) == {"find_tour_markets", "get_city_playbook", "suggest_support_acts", "rank_venues", "get_local_moment"}


def test_public_mode_imports_without_tour_data_api_url(public_main):
    assert public_main.PUBLIC is True


def test_public_session_id_is_a_hash_of_the_ip(public_main):
    sid = public_main.public_session_id("203.0.113.9")
    assert sid.startswith("mcp-public-") and "203.0.113.9" not in sid and len(sid) == len("mcp-public-") + 16
    assert sid == public_main.public_session_id("203.0.113.9")
    assert sid != public_main.public_session_id("203.0.113.10")


def test_rate_limit_middleware_returns_429_after_the_limit(public_main):
    from starlette.testclient import TestClient
    public_main.LIMITER.limit = 2
    c = TestClient(public_main.app, raise_server_exceptions=False)
    codes = [c.post("/mcp", headers={"x-forwarded-for": "198.51.100.1"}, json={}).status_code for _ in range(3)]
    assert codes[-1] == 429
    assert codes[0] != 429 and codes[1] != 429
    r = c.post("/mcp", headers={"x-forwarded-for": "198.51.100.1"}, json={})
    assert r.json() == {"error": "Rate limit reached — try again in a few minutes"}
    # a different client IP is unaffected
    assert c.post("/mcp", headers={"x-forwarded-for": "198.51.100.2"}, json={}).status_code != 429


def test_first_forwarded_entry_is_the_client_ip(public_main):
    scope = {"headers": [(b"x-forwarded-for", b"198.51.100.7, 10.0.0.1")], "client": ("10.0.0.1", 1234)}
    assert public_main.client_ip(scope) == "198.51.100.7"
    assert public_main.client_ip({"headers": [], "client": ("192.0.2.4", 1)}) == "192.0.2.4"


def test_public_find_tour_markets_is_limited_to_two_regions(public_main, monkeypatch):
    seen = {}

    def fake(artist, regions, max_stops, **kw):
        seen.update(kw)
        return {"status": "ok"}

    monkeypatch.setattr(public_main.taste_tools, "find_tour_markets", fake)
    monkeypatch.setattr(public_main, "_request_ip", lambda: "203.0.113.9")
    public_main.find_tour_markets("A", ["x"], 8)
    assert seen["max_regions"] == 2
    assert seen["session_id"] == public_main.public_session_id("203.0.113.9")
