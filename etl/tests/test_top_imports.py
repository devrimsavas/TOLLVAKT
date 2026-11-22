import argparse

import pytest

from tollvakt_etl.ssb import TradeValue
from tollvakt_etl.top_imports import parse_chapters, select

IMPORTS = [
    TradeValue("87038001", 900, "cars"),
    TradeValue("61091000", 500, "t-shirts"),
    TradeValue("85171300", 400, "smartphones"),
    TradeValue("61102000", 300, "jerseys"),
    TradeValue("61099000", 200, "t-shirts, other"),
    TradeValue("64039900", 100, "shoes"),
]


def codes(items):
    return [item.code for item in items]


def test_without_chapters_takes_the_overall_top():
    assert codes(select(IMPORTS, top=2)) == ["87038001", "61091000"]


def test_with_chapters_takes_the_top_of_each_chapter_in_the_given_order():
    selected = select(IMPORTS, top=50, chapters=["64", "61"], per_chapter=2)
    assert codes(selected) == ["64039900", "61091000", "61102000"]


def test_parse_chapters_pads_and_checks():
    assert parse_chapters("9, 61,62") == ["09", "61", "62"]
    with pytest.raises(argparse.ArgumentTypeError):
        parse_chapters("6109")
