import json
import sys


def _body(**over):
    body = {
        "title": "Lumen Vale — Mexico, Brazil", "artist": "Lumen Vale", "artist_entity_id": "Q1",
        "regions": ["Mexico", "Brazil"], "date_window": {"start": "2027-03-12", "end": "2027-04-18"},
        "cities": [{"id": "4005539", "name": "Guadalajara", "country": "MX", "verdict": "hidden_goldmine", "winnability": 72},
                   {"id": "3464975", "name": "Curitiba", "country": "BR", "verdict": "hidden_goldmine", "winnability": 64}],
        "board_json": json.dumps({"chapters": 2}),
    }
    body.update(over)
    return body


def test_creates_cities_campaign_stops_and_tour_row(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []          # no existing qloo_ cities
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/qloo_tours", json=_body())
    assert res.status_code == 201
    assert res.get_json()["stops"] == 2
    tables = [c.args[0].split(".")[-1] for c in mock_bq.insert_rows_json.call_args_list]
    assert tables == ["cities", "campaigns", "campaign_stops", "qloo_tours"]
    cities = mock_bq.insert_rows_json.call_args_list[0].args[1]
    assert cities[0] == {"city_id": "qloo_4005539", "city_name": "Guadalajara", "country": "MX", "primary_language": "und", "timezone": "UTC", "region": "qloo_import"}
    campaign = mock_bq.insert_rows_json.call_args_list[1].args[1][0]
    assert campaign["campaign_type"] == "music_tour" and campaign["genre"] == "music"
    assert campaign["talent_roster"] == ["Lumen Vale"] and campaign["selected_metrics"] == []
    assert campaign["campaign_id"] == res.get_json()["campaign_id"]
    stops = mock_bq.insert_rows_json.call_args_list[2].args[1]
    assert [s["city_id"] for s in stops] == ["qloo_4005539", "qloo_3464975"]
    assert [s["sequence_order"] for s in stops] == [1, 2]
    tour = mock_bq.insert_rows_json.call_args_list[3].args[1][0]
    assert tour["date_window_start"] == "2027-03-12" and tour["artist_entity_id"] == "Q1"


def test_skips_cities_that_already_exist(client, mock_bq):
    mock_bq.query.return_value.result.return_value = [{"city_id": "qloo_4005539"}, {"city_id": "qloo_3464975"}]
    mock_bq.insert_rows_json.return_value = []
    client.post("/qloo_tours", json=_body())
    tables = [c.args[0].split(".")[-1] for c in mock_bq.insert_rows_json.call_args_list]
    assert tables == ["campaigns", "campaign_stops", "qloo_tours"]


def test_null_date_window_is_accepted(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    mock_bq.insert_rows_json.return_value = []
    res = client.post("/qloo_tours", json=_body(date_window=None))
    assert res.status_code == 201
    tour = mock_bq.insert_rows_json.call_args_list[3].args[1][0]
    assert tour["date_window_start"] is None and tour["date_window_end"] is None


def test_rejects_reversed_window_and_oversized_payloads(client):
    assert client.post("/qloo_tours", json=_body(date_window={"start": "2027-04-01", "end": "2027-03-01"})).status_code == 400
    assert client.post("/qloo_tours", json=_body(cities=[])).status_code == 400
    assert client.post("/qloo_tours", json=_body(board_json="x" * 200001)).status_code == 400
    assert client.post("/qloo_tours", json=_body(artist="")).status_code == 400


def test_insert_failure_is_a_500_with_details(client, mock_bq):
    mock_bq.query.return_value.result.return_value = []
    mock_bq.insert_rows_json.return_value = [{"index": 0, "errors": ["boom"]}]
    res = client.post("/qloo_tours", json=_body())
    assert res.status_code == 500
    assert res.get_json()["error"] == "insert failed"


def test_dataset_comes_from_env(monkeypatch):
    main = sys.modules["tour_data_api_main"]
    assert main._dataset() == "tour_intelligence"
    monkeypatch.setenv("BQ_DATASET", "tour_intelligence_qloo")
    # read at call time so tests and the deploy can switch datasets without re-import
    assert main._dataset() == "tour_intelligence_qloo"


def test_writes_go_to_the_configured_dataset(client, mock_bq, monkeypatch):
    monkeypatch.setenv("BQ_DATASET", "tour_intelligence_qloo")
    mock_bq.query.return_value.result.return_value = []
    mock_bq.insert_rows_json.return_value = []
    client.post("/qloo_tours", json=_body())
    assert mock_bq.insert_rows_json.call_args_list[-1].args[0] == "test-project.tour_intelligence_qloo.qloo_tours"


def test_rejects_a_non_object_body_with_400(client):
    assert client.post("/qloo_tours", json=[1, 2]).status_code == 400


def test_rejects_empty_or_overlong_regions_and_duplicate_cities(client):
    assert client.post("/qloo_tours", json=_body(regions=[""])).status_code == 400
    assert client.post("/qloo_tours", json=_body(regions=["x" * 121])).status_code == 400
    dup = {"id": "4005539", "name": "Guadalajara", "country": "MX", "verdict": "hidden_goldmine", "winnability": 72}
    res = client.post("/qloo_tours", json=_body(cities=[dup, dup]))
    assert res.status_code == 400
    assert "duplicate" in res.get_json()["error"]
