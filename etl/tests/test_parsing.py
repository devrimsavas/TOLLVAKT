from datetime import date
from decimal import Decimal

import pytest

from tollvakt_etl.parsing import clean_text, parse_date, parse_decimal


def test_parse_date():
    assert parse_date("2026-01-01") == date(2026, 1, 1)
    assert parse_date("") is None
    assert parse_date(None) is None


def test_parse_decimal_with_comma():
    assert parse_decimal("24,67") == Decimal("24.67")
    assert parse_decimal("999999,99") == Decimal("999999.99")
    assert parse_decimal(" ") is None


def test_parse_decimal_rejects_text():
    with pytest.raises(ValueError):
        parse_decimal("abc")


def test_clean_text():
    assert clean_text("  Horses :  ") == "Horses :"
    assert clean_text("   ") is None
    assert clean_text(None) is None


def test_clean_text_decodes_entities_and_removes_soft_hyphens():
    assert clean_text("laksefisk (&#34;salmonidae&#34;)") == 'laksefisk ("salmonidae")'
    assert clean_text("men&#39;s &#96;x&#96; a &#61; b") == "men's `x` a = b"
    assert clean_text("Oncor\u00adhynchus nerka") == "Oncorhynchus nerka"
    assert clean_text("\u00ad") is None
