import pytest

import gateway


def boom():
    raise AssertionError("must not fetch a Google identity token for a local gateway")


@pytest.mark.parametrize("url", ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"])
def test_loopback_gateway_gets_no_token(monkeypatch, url):
    monkeypatch.setenv("QLOO_GATEWAY_URL", url)
    headers = gateway._headers("s1", boom)
    assert headers == {"x-session-id": "s1"}


def test_remote_gateway_still_sends_token(monkeypatch):
    monkeypatch.setenv("QLOO_GATEWAY_URL", "https://qloo-gateway-abc.run.app")
    assert gateway._headers("s1", lambda: "tok") == {"Authorization": "Bearer tok", "x-session-id": "s1"}


def test_lookalike_host_is_not_loopback(monkeypatch):
    monkeypatch.setenv("QLOO_GATEWAY_URL", "https://localhost.evil.example")
    assert gateway._headers("s1", lambda: "tok")["Authorization"] == "Bearer tok"
