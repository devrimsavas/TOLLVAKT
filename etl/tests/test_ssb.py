import pytest

from tollvakt_etl import ssb
from tollvakt_etl.ssb import SsbError, imports_by_code, parse_json_stat, ssb_code

# The shape SSB answers with (JSON-stat 2), here for three code versions
ANSWER = {
    "id": ["Varekoder", "ImpEks", "ContentsCode", "Tid"],
    "size": [4, 1, 1, 1],
    "dimension": {
        "Varekoder": {
            "category": {
                "index": {"85171300_2022": 0, "02011000_1988": 1, "85171300_2017": 2, "99999999_1988": 3},
                "label": {
                    "85171300_2022": "Smartphones (2022-)",
                    "02011000_1988": "Carcases or half-carcases of bovine animals (1988-)",
                    "85171300_2017": "Smartphones (2017-2021)",
                    "99999999_1988": "Confidential",
                },
            }
        },
        "ImpEks": {"category": {"index": {"1": 0}}},
        "ContentsCode": {"category": {"index": {"Verdi": 0}}},
        "Tid": {"category": {"index": {"2025": 0}}},
    },
    "value": [1000, 50, 200, 999999],
}


class FakeResponse:
    def __init__(self, status_code, data=None, text=""):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self._data = data
        self.text = text

    def json(self):
        return self._data


def test_ssb_code_drops_the_start_year():
    assert ssb_code("02011000_1988") == "02011000"
    assert ssb_code("02011000") == "02011000"


def test_parse_json_stat_walks_the_dimensions_in_order():
    data = {
        "id": ["A", "B"],
        "dimension": {
            "A": {"category": {"index": {"a2": 1, "a1": 0}}},
            "B": {"category": {"index": {"b1": 0, "b2": 1}}},
        },
        "value": [1, 2, 3, None],
    }
    assert parse_json_stat(data) == [
        ({"A": "a1", "B": "b1"}, 1),
        ({"A": "a1", "B": "b2"}, 2),
        ({"A": "a2", "B": "b1"}, 3),
        ({"A": "a2", "B": "b2"}, None),
    ]


def test_parse_json_stat_reports_an_unexpected_shape():
    with pytest.raises(SsbError, match="missing"):
        parse_json_stat({"id": ["A"]})


def test_imports_adds_up_code_versions_and_leaves_out_confidential_codes(monkeypatch):
    sent = {}

    def fake_get(url, params=None, timeout=None):
        sent.update(url=url, params=params)
        return FakeResponse(200, ANSWER)

    monkeypatch.setattr(ssb.requests, "get", fake_get)

    result = imports_by_code(2025)

    assert [(t.code, t.value_nok) for t in result] == [("85171300", 1200.0), ("02011000", 50.0)]
    assert result[0].description_en == "Smartphones (2022-)"
    assert sent["url"].endswith("/tables/08801/data")
    # No country dimension: SSB adds up all countries
    assert sent["params"] == {
        "lang": "en",
        "valueCodes[Varekoder]": "*",
        "valueCodes[ImpEks]": "1",
        "valueCodes[ContentsCode]": "Verdi",
        "valueCodes[Tid]": "2025",
    }


def test_imports_reports_errors(monkeypatch):
    monkeypatch.setattr(ssb.requests, "get", lambda *a, **k: FakeResponse(400, text="bad query"))
    with pytest.raises(SsbError, match="answered 400: bad query"):
        imports_by_code(2025)
