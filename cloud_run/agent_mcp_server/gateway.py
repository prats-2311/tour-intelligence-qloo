"""Thin client for the qloo_gateway. Every Qloo call from the MCP taste tools
goes through here, so the gateway's validation, cache and per-session budget
always apply. Error messages are safe to show to an MCP client."""

from __future__ import annotations

import json
import os

import requests

_TIMEOUT = 180
_UNAVAILABLE = "Qloo gateway unavailable"


class GatewayError(Exception):
    """Message is safe to show to an MCP client (no tokens, no stack traces)."""


def gateway_url() -> str:
    # No default: checked per call so the server still starts without it.
    url = os.environ.get("QLOO_GATEWAY_URL", "").strip().rstrip("/")
    if not url:
        raise GatewayError("Qloo gateway not configured")
    return url


class GatewayNotFound(GatewayError):
    """The gateway answered 404 (for example an unknown or expired workspace)."""


def _is_loopback(url: str) -> bool:
    from urllib.parse import urlparse

    try:
        return urlparse(url).hostname in ("localhost", "127.0.0.1", "::1")
    except ValueError:
        return False


def _headers(session_id: str, token_fn) -> dict:
    # A gateway on this machine (npm run dev:all) needs no Google identity token; never call gcloud for it.
    if _is_loopback(os.environ.get("QLOO_GATEWAY_URL", "")):
        return {"x-session-id": session_id}
    try:
        token = token_fn()
    except Exception:
        raise GatewayError(_UNAVAILABLE) from None
    return {"Authorization": f"Bearer {token}", "x-session-id": session_id}


def stream_events(path: str, *, method: str = "GET", params: dict | None = None, body: dict | None = None,
                  session_id: str, token_fn) -> list[dict]:
    url = f"{gateway_url()}{path}"
    headers = _headers(session_id, token_fn)
    events: list[dict] = []
    try:
        if method == "POST":
            ctx = requests.post(url, headers=headers, json=body or {}, stream=True, timeout=_TIMEOUT)
        else:
            ctx = requests.get(url, headers=headers, params=params or {}, stream=True, timeout=_TIMEOUT)
        with ctx as resp:
            if resp.status_code != 200:
                raise GatewayError(_UNAVAILABLE)
            resp.encoding = "utf-8"  # text/event-stream has no charset; requests would guess latin-1
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data:"):
                    continue
                try:
                    event = json.loads(line[5:].strip())
                except ValueError:
                    continue
                if not isinstance(event, dict):
                    continue
                events.append(event)
                if event.get("type") in ("done", "error"):
                    break
    except requests.RequestException:
        raise GatewayError(_UNAVAILABLE) from None
    return events


def call_tool(name: str, args: dict, *, session_id: str, token_fn) -> dict:
    url = f"{gateway_url()}/v1/tools/{name}"
    headers = _headers(session_id, token_fn)
    try:
        with requests.post(url, headers=headers, json=args, timeout=_TIMEOUT) as resp:
            if resp.status_code != 200:
                raise GatewayError(_UNAVAILABLE)
            payload = resp.json()
    except (requests.RequestException, ValueError):
        raise GatewayError(_UNAVAILABLE) from None
    return {"envelope": payload.get("envelope") if isinstance(payload, dict) else None}


def get_json(path: str, *, params: dict | None = None, session_id: str, token_fn) -> dict:
    """Plain JSON GET (e.g. /v1/advance, /v1/sponsor-segments, /v1/ws/:ws). 404 raises GatewayNotFound."""
    url = f"{gateway_url()}{path}"
    headers = _headers(session_id, token_fn)
    try:
        with requests.get(url, headers=headers, params=params or {}, timeout=_TIMEOUT) as resp:
            if resp.status_code == 404:
                raise GatewayNotFound("Not found")
            if resp.status_code != 200:
                raise GatewayError(_UNAVAILABLE)
            payload = resp.json()
    except (requests.RequestException, ValueError):
        raise GatewayError(_UNAVAILABLE) from None
    if not isinstance(payload, dict):
        raise GatewayError(_UNAVAILABLE)
    return payload
