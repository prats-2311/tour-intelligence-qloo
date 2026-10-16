import json
from unittest.mock import MagicMock

PLAYBOOK = {"type": "playbook", "playbook": {"city": {"name": "Guadalajara", "country": "MX"}, "cards": [
    {"kind": "sponsors", "status": "ok", "items": [{"name": f"B{i}", "affinity": 0.9 - i / 100} for i in range(7)], "refs": [], "warnings": []},
    {"kind": "venue_fit", "status": "ok", "items": [{"name": "C3 Stage", "affinity": 0.91}], "refs": [], "warnings": []},
    {"kind": "co_billing", "status": "ok", "items": [{"name": "Bruma Nocturna", "overlap": 0.34, "localAffinity": 0.88, "lift": 0.2992}], "refs": [], "warnings": []},
    {"kind": "talent", "status": "ok", "items": [{"name": "Clara Sol", "affinity": 0.61}], "refs": [], "warnings": [], "summary": {"overlap": 0.12}},
    {"kind": "promo_zones", "status": "ok", "items": [{"label": "Colonia Americana", "share": 0.38}], "refs": [], "warnings": []},
]}}


def _sse(*events):
    lines = []
    for e in events:
        lines += [f"event: {e['type']}", f"data: {json.dumps(e)}", ""]
    return lines


def _tour_row(mock_bq):
    mock_bq.query.return_value.result.return_value = [{
        "artist": "Lumen Vale", "artist_entity_id": "Q1",
        "cities_json": json.dumps([{"id": "4005539", "name": "Guadalajara", "country": "MX"}]),
    }]


def test_compacts_the_gateway_playbook(client, mock_bq, monkeypatch):
    import tour_data_api_main as main
    _tour_row(mock_bq)
    monkeypatch.setenv("QLOO_GATEWAY_URL", "https://gw.test")
    monkeypatch.setattr(main, "_gateway_id_token", lambda url: "tok")
    resp = MagicMock(status_code=200)
    resp.iter_lines.return_value = _sse({"type": "tool_result", "tool": "qloo_recommend"}, PLAYBOOK, {"type": "done", "summary": {}})
    get = MagicMock(return_value=resp)
    monkeypatch.setattr(main.requests, "get", get)
    res = client.get("/qloo_city_evidence?campaign_id=c1&city_id=qloo_4005539")
    assert res.status_code == 200
    body = res.get_json()
    assert len(body["evidence"]["sponsors"]) == 5
    assert body["evidence"]["co_billing"][0] == {"name": "Bruma Nocturna", "overlap": 0.34, "local_affinity": 0.88, "lift": 0.2992}
    assert body["evidence"]["talent"]["overlap"] == 0.12
    assert body["requests"] == 1
    url = get.call_args.args[0]
    assert "narrative=0" in url and "artistEntityId=Q1" in url
    assert get.call_args.kwargs["headers"]["x-session-id"] == "stage2-c1"


def test_404_when_city_not_in_tour(client, mock_bq, monkeypatch):
    _tour_row(mock_bq)
    monkeypatch.setenv("QLOO_GATEWAY_URL", "https://gw.test")
    assert client.get("/qloo_city_evidence?campaign_id=c1&city_id=qloo_999").status_code == 404


def test_503_without_gateway_url(client, mock_bq, monkeypatch):
    _tour_row(mock_bq)
    monkeypatch.delenv("QLOO_GATEWAY_URL", raising=False)
    assert client.get("/qloo_city_evidence?campaign_id=c1&city_id=qloo_4005539").status_code == 503


def test_502_on_gateway_error_event(client, mock_bq, monkeypatch):
    import tour_data_api_main as main
    _tour_row(mock_bq)
    monkeypatch.setenv("QLOO_GATEWAY_URL", "https://gw.test")
    monkeypatch.setattr(main, "_gateway_id_token", lambda url: "tok")
    resp = MagicMock(status_code=200)
    resp.iter_lines.return_value = _sse({"type": "error", "code": "BUDGET", "message": "limit"})
    monkeypatch.setattr(main.requests, "get", MagicMock(return_value=resp))
    assert client.get("/qloo_city_evidence?campaign_id=c1&city_id=qloo_4005539").status_code == 502


def test_city_briefs_post_accepts_qloo_evidence_json(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/city_briefs", json={"brief_id": "b", "campaign_id": "c", "city_id": "qloo_1", "status": "final", "qloo_evidence_json": "{\"sponsors\": []}"})
    assert res.status_code == 200
    assert mock_bq.insert_rows_json.call_args.args[1][0]["qloo_evidence_json"] == "{\"sponsors\": []}"
