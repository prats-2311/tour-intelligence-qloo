import pytest

import run_campaign


def test_known_context_includes_qloo_evidence_labelled_as_aggregate():
    ctx = run_campaign._known_context({"qloo_evidence": {"sponsors": [{"name": "Cerro Alto Mezcal", "affinity": 0.91}]}})
    assert "qloo_taste_evidence (aggregate Qloo affinity, not individuals):" in ctx
    assert "Cerro Alto Mezcal" in ctx


def test_known_context_omits_qloo_line_without_evidence():
    assert "qloo_taste_evidence" not in run_campaign._known_context({"culture_summary": "x"})


def test_fetch_qloo_evidence_returns_none_on_failure(monkeypatch):
    monkeypatch.setattr(run_campaign.requests, "get", lambda *a, **k: (_ for _ in ()).throw(ConnectionError("down")))
    assert run_campaign._fetch_qloo_evidence("c1", "qloo_1", "tok") is None


def test_fetch_qloo_evidence_returns_none_on_non_200(monkeypatch):
    class R:
        status_code = 502
    monkeypatch.setattr(run_campaign.requests, "get", lambda *a, **k: R())
    assert run_campaign._fetch_qloo_evidence("c1", "qloo_1", "tok") is None


def test_fetch_qloo_evidence_returns_evidence_block(monkeypatch):
    class R:
        status_code = 200
        def json(self):
            return {"artist": "A", "evidence": {"sponsors": []}, "requests": 3}
    monkeypatch.setattr(run_campaign, "TOUR_DATA_API", "https://tda.test")
    seen = {}
    def fake_get(url, **k):
        seen.update(url=url, **k)
        return R()
    monkeypatch.setattr(run_campaign.requests, "get", fake_get)
    assert run_campaign._fetch_qloo_evidence("c1", "qloo_1", "tok") == {"sponsors": []}
    assert seen["url"] == "https://tda.test/qloo_city_evidence"
    assert seen["params"] == {"campaign_id": "c1", "city_id": "qloo_1"}


def test_run_campaign_refuses_to_start_without_tour_data_api_url(monkeypatch):
    monkeypatch.setattr(run_campaign, "TOUR_DATA_API", "")
    with pytest.raises(SystemExit, match="TOUR_DATA_API_URL is not set"):
        run_campaign.run_campaign("c1")
