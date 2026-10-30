"""Test traffic convention: a request carrying `x-tiq-test: 1` is forwarded to the gateway with the same header,
so the gateway's BigQuery analytics leave it out. Anything else sends no such header."""
import gateway
from unittest.mock import MagicMock
from test_public_mode import public_main  # noqa: F401  (module-scoped fixture)


def _resp(payload=None):
    r = MagicMock(status_code=200)
    r.json.return_value = payload or {"envelope": {"status": "error"}}
    r.__enter__ = lambda s: s
    r.__exit__ = lambda s, *a: False
    return r


def test_gateway_headers_have_no_test_flag_by_default():
    h = gateway._headers("mcp-1", lambda: "tok")
    assert "x-tiq-test" not in h


def test_gateway_headers_carry_the_flag_when_the_request_was_marked():
    token = gateway.TEST_TRAFFIC.set(True)
    try:
        h = gateway._headers("mcp-1", lambda: "tok")
    finally:
        gateway.TEST_TRAFFIC.reset(token)
    assert h["x-tiq-test"] == "1" and h["x-session-id"] == "mcp-1"
    assert "x-tiq-test" not in gateway._headers("mcp-1", lambda: "tok")  # reset: no leak to the next request


def test_public_request_with_the_header_reaches_the_gateway_marked(public_main, monkeypatch):  # noqa: F811
    from starlette.testclient import TestClient
    seen = []

    def fake_post(url, headers, **kw):
        seen.append(headers)
        return _resp()

    monkeypatch.setattr(gateway.requests, "post", fake_post)
    monkeypatch.setattr(public_main, "_identity_token", lambda url: "tok")
    base = {"accept": "application/json, text/event-stream", "content-type": "application/json"}
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "get_local_moment", "arguments": {"artist": "Lumen Vale", "city": "Guadalajara", "country": "MX"}}}
    with TestClient(public_main.app, raise_server_exceptions=False) as c:
        for i, extra in enumerate(({"x-tiq-test": "1"}, {}, {"x-tiq-test": "0"})):
            r = c.post("/mcp", headers={**base, "x-forwarded-for": f"1.2.3.{i + 40}", **extra}, json=body)
            assert r.status_code == 200, r.text
    assert len(seen) == 3
    assert seen[0].get("x-tiq-test") == "1"
    assert "x-tiq-test" not in seen[1] and "x-tiq-test" not in seen[2]
