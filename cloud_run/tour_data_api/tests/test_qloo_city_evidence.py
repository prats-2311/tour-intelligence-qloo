import json
from unittest.mock import MagicMock

import pytest


@pytest.fixture(autouse=True)
def _qloo_dataset(monkeypatch):
    monkeypatch.setenv("BQ_DATASET", "tour_intelligence_qloo")

PLAYBOOK = {"type": "playbook", "playbook": {"city": {"name": "Guadalajara", "country": "MX"}, "cards": [
    {"kind": "sponsors", "status": "ok", "items": [{"name": f"B{i}", "affinity": 0.9 - i / 100} for i in range(7)], "refs": [], "warnings": []},
    {"kind": "venue_fit", "status": "ok", "items": [{"name": "C3 Stage", "affinity": 0.91}], "refs": [], "warnings": []},
    {"kind": "co_billing", "status": "ok", "items": [{"name": "Bruma Nocturna", "entityId": "E9", "sharedTaste": 0.34, "localAffinity": 0.88, "lift": 0.2992, "sharedTags": ["Indie pop", "Dream pop"]}], "refs": [], "warnings": []},
    {"kind": "talent", "status": "ok", "items": [{"name": "Clara Sol", "affinity": 0.61}], "refs": [], "warnings": [], "summary": {"sharedTaste": 0.12}, "sharedTags": ["Synth pop"]},
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
    resp.__enter__.return_value = resp
    resp.iter_lines.return_value = _sse({"type": "tool_result", "tool": "qloo_recommend"}, PLAYBOOK, {"type": "done", "summary": {}})
    get = MagicMock(return_value=resp)
    monkeypatch.setattr(main.requests, "get", get)
    res = client.get("/qloo_city_evidence?campaign_id=c1&city_id=qloo_4005539")
    assert res.status_code == 200
    body = res.get_json()
    assert len(body["evidence"]["sponsors"]) == 5
    assert body["evidence"]["co_billing"][0] == {"name": "Bruma Nocturna", "shared_taste": 0.34, "local_affinity": 0.88, "lift": 0.2992, "shared_tags": ["Indie pop", "Dream pop"]}
    assert body["evidence"]["talent"]["shared_taste"] == 0.12
    assert "overlap" not in body["evidence"]["talent"]
    assert body["requests"] == 1
    url = get.call_args.args[0]
    assert "narrative=0" in url and "artistEntityId=Q1" in url
    assert get.call_args.kwargs["headers"]["x-session-id"] == "stage2-c1"
    resp.__exit__.assert_called_once()  # the streamed response is closed


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
    resp.__enter__.return_value = resp
    resp.iter_lines.return_value = _sse({"type": "error", "code": "BUDGET", "message": "limit"})
    monkeypatch.setattr(main.requests, "get", MagicMock(return_value=resp))
    assert client.get("/qloo_city_evidence?campaign_id=c1&city_id=qloo_4005539").status_code == 502


def test_city_briefs_post_accepts_qloo_evidence_json(client, mock_bq):
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/city_briefs", json={"brief_id": "b", "campaign_id": "c", "city_id": "qloo_1", "status": "final", "qloo_evidence_json": "{\"sponsors\": []}"})
    assert res.status_code == 200
    assert mock_bq.insert_rows_json.call_args.args[1][0]["qloo_evidence_json"] == "{\"sponsors\": []}"


@pytest.mark.parametrize("value", [None, "tour_intelligence", "TOUR_INTELLIGENCE"])
def test_503_when_dataset_is_the_original_or_unset(client, mock_bq, monkeypatch, value):
    if value is None:
        monkeypatch.delenv("BQ_DATASET", raising=False)
    else:
        monkeypatch.setenv("BQ_DATASET", value)
    res = client.get("/qloo_city_evidence?campaign_id=c1&city_id=qloo_4005539")
    assert res.status_code == 503
    assert res.get_json() == {"error": "BQ_DATASET not configured"}
    mock_bq.query.assert_not_called()


def test_shared_dataset_opt_in_allows_tour_intelligence_on_evidence(client, mock_bq, monkeypatch):
    monkeypatch.setenv("BQ_DATASET", "tour_intelligence")
    monkeypatch.setenv("ALLOW_SHARED_DATASET", "1")
    monkeypatch.setenv("QLOO_GATEWAY_URL", "https://gw.test")
    mock_bq.query.return_value.result.return_value = []  # no tour row -> 404 proves the guard passed
    res = client.get("/qloo_city_evidence?campaign_id=c1&city_id=qloo_4005539")
    assert res.status_code == 404
    mock_bq.query.assert_called()


@pytest.mark.parametrize("flag", ["true", "0", None])
def test_shared_dataset_flag_other_than_1_still_503_on_evidence(client, mock_bq, monkeypatch, flag):
    monkeypatch.setenv("BQ_DATASET", "tour_intelligence")
    if flag is None:
        monkeypatch.delenv("ALLOW_SHARED_DATASET", raising=False)
    else:
        monkeypatch.setenv("ALLOW_SHARED_DATASET", flag)
    res = client.get("/qloo_city_evidence?campaign_id=c1&city_id=qloo_4005539")
    assert res.status_code == 503
    mock_bq.query.assert_not_called()


def test_shared_dataset_flag_does_not_unlock_unset_dataset_on_evidence(client, mock_bq, monkeypatch):
    monkeypatch.delenv("BQ_DATASET", raising=False)
    monkeypatch.setenv("ALLOW_SHARED_DATASET", "1")
    assert client.get("/qloo_city_evidence?campaign_id=c1&city_id=qloo_4005539").status_code == 503
    mock_bq.query.assert_not_called()
