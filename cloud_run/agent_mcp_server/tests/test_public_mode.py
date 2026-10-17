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
    old = public_main.LIMITER.limit
    public_main.LIMITER.limit = 2
    try:
        c = TestClient(public_main.app, raise_server_exceptions=False)
        codes = [c.post("/mcp", headers={"x-forwarded-for": "198.51.100.1"}, json={}).status_code for _ in range(3)]
        assert codes[-1] == 429
        assert codes[0] != 429 and codes[1] != 429
        r = c.post("/mcp", headers={"x-forwarded-for": "198.51.100.1"}, json={})
        assert r.json() == {"error": "Rate limit reached — try again in a few minutes"}
        # a different client IP is unaffected
        assert c.post("/mcp", headers={"x-forwarded-for": "198.51.100.2"}, json={}).status_code != 429
    finally:
        public_main.LIMITER.limit = old


def test_rightmost_forwarded_entry_is_the_client_ip(public_main):
    scope = {"headers": [(b"x-forwarded-for", b"203.0.113.9, 198.51.100.7")], "client": ("10.0.0.1", 1234)}
    assert public_main.client_ip(scope) == "198.51.100.7"
    assert public_main.client_ip({"headers": [], "client": ("192.0.2.4", 1)}) == "192.0.2.4"


def test_spoofed_first_forwarded_entry_does_not_bypass_the_limit(public_main):
    from starlette.testclient import TestClient
    old = public_main.LIMITER.limit
    public_main.LIMITER.limit = 2
    try:
        c = TestClient(public_main.app, raise_server_exceptions=False)
        codes = [c.post("/mcp", headers={"x-forwarded-for": f"1.1.1.{i}, 198.51.100.50"}, json={}).status_code for i in range(3)]
        assert codes[-1] == 429
    finally:
        public_main.LIMITER.limit = old


def test_unconfigured_gateway_gives_a_clean_error(public_main, monkeypatch):
    monkeypatch.delenv("QLOO_GATEWAY_URL", raising=False)
    with pytest.raises(RuntimeError) as e:
        public_main.get_local_moment("Lumen Vale", "Guadalajara", "MX")
    assert str(e.value) == "Qloo gateway not configured"
    assert "Traceback" not in str(e.value)


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


def test_public_find_tour_markets_caps_max_stops_at_three(public_main, monkeypatch):
    calls = []
    monkeypatch.setattr(public_main.taste_tools, "find_tour_markets", lambda artist, regions, max_stops, **kw: calls.append(max_stops) or {"status": "ok"})
    monkeypatch.setattr(public_main, "_request_ip", lambda: "203.0.113.9")
    public_main.find_tour_markets("A", ["x"], 20)
    public_main.find_tour_markets("A", ["x"], 2)
    assert calls == [3, 2]


def test_tools_call_through_the_middleware_uses_a_per_ip_session_id(public_main, monkeypatch):
    """middleware -> contextvar -> tool -> gateway client: the right-most XFF IP decides the gateway session id."""
    from starlette.testclient import TestClient
    seen = []

    def fake_call_tool(name, args, *, session_id, token_fn):
        seen.append(session_id)
        return {"envelope": {"status": "error"}}

    monkeypatch.setattr(public_main.taste_tools, "call_tool", fake_call_tool)
    headers = {"accept": "application/json, text/event-stream", "content-type": "application/json"}
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "get_local_moment", "arguments": {"artist": "Lumen Vale", "city": "Guadalajara", "country": "MX"}}}
    with TestClient(public_main.app, raise_server_exceptions=False) as c:
        for ip in ("198.51.100.21", "198.51.100.22"):
            r = c.post("/mcp", headers={**headers, "x-forwarded-for": f"1.2.3.4, {ip}"}, json=body)
            assert r.status_code == 200, r.text
    assert seen == [public_main.public_session_id("198.51.100.21"), public_main.public_session_id("198.51.100.22")]
    assert len(set(seen)) == 2 and all(s.startswith("mcp-public-") for s in seen)


def test_public_mode_instructions_name_the_qloo_project(public_main):
    ins = public_main.mcp.instructions
    assert "Tour Intelligence × Qloo" in ins
    assert "Agentic Tour" not in ins
