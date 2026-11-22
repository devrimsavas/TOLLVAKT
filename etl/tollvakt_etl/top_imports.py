"""List the commodity codes Norway imports most, for the classification test set.

Usage (from the etl/ folder, with the venv active):

    python -m tollvakt_etl.top_imports                 # last year, top 50
    python -m tollvakt_etl.top_imports --year 2024 --top 100
    python -m tollvakt_etl.top_imports --sme           # top 3 in each chapter small importers use
    python -m tollvakt_etl.top_imports --chapters 61,62,64 --per-chapter 5

Reads import values from Statistics Norway (table 08801), adds the tariff
texts from the database and writes data/eval/top_imports_<year>.csv.
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import date

from tollvakt_etl.config import DATA_DIR
from tollvakt_etl.db import connect
from tollvakt_etl.ssb import SsbError, TradeValue, imports_by_code

EVAL_DIR = DATA_DIR / "eval"

# Chapters typical for small importers, Tollvakt's users: clothing and shoes,
# furniture and toys, cosmetics, coffee and food, ceramics, glass and
# kitchenware, tools and electronics, bicycles. The overall top codes are
# mostly fuel, ores and ships, which large companies import.
SME_CHAPTERS = (
    "09", "15", "20", "21",  # coffee, tea, spices; oils; preserved and other food
    "33",  # cosmetics
    "61", "62", "64",  # clothing, shoes
    "69", "70", "73",  # ceramics, glass, articles of iron or steel
    "82", "84", "85",  # tools, machines, electronics
    "87",  # vehicles and bicycles
    "94", "95",  # furniture and lamps, toys and sports equipment
)

COLUMNS = ["rank", "code", "import_value_nok", "in_tariff", "description_nb", "description_en", "ssb_description"]


def tariff_texts(codes: list[str]) -> dict[str, tuple[str | None, str | None]]:
    """Current tariff path texts of the codes, from the database."""
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT c.code, n.search_text_nb, n.search_text_en
              FROM commodities c
              LEFT JOIN tariff_nodes n ON n.id = c.node_id
             WHERE c.code = ANY(%s)
               AND (c.valid_to IS NULL OR c.valid_to >= current_date)
            """,
            (codes,),
        ).fetchall()
    return {code: (nb, en) for code, nb, en in rows}


def select(
    imports: list[TradeValue],
    *,
    top: int,
    chapters: list[str] | None = None,
    per_chapter: int = 3,
) -> list[TradeValue]:
    """The codes to list. Without chapters: the overall top. With chapters:
    the top codes of each chapter, in the order the chapters are given.
    imports must be sorted by value, largest first."""
    if not chapters:
        return imports[:top]
    selected: list[TradeValue] = []
    for chapter in chapters:
        selected.extend([item for item in imports if item.code.startswith(chapter)][:per_chapter])
    return selected


def parse_chapters(value: str) -> list[str]:
    chapters = [part.strip().zfill(2) for part in value.split(",") if part.strip()]
    for chapter in chapters:
        if not (len(chapter) == 2 and chapter.isdigit()):
            raise argparse.ArgumentTypeError(f"not a 2-digit chapter: {chapter}")
    return chapters


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Most imported commodity codes (SSB table 08801)")
    parser.add_argument("--year", type=int, default=date.today().year - 1, help="statistics year (default: last year)")
    parser.add_argument("--top", type=int, default=50, help="how many codes (default: 50)")
    parser.add_argument("--chapters", type=parse_chapters, help="only these chapters, e.g. 61,62,64")
    parser.add_argument("--sme", action="store_true", help="the chapters small importers use (see SME_CHAPTERS)")
    parser.add_argument("--per-chapter", type=int, default=3, help="codes per chapter (default: 3)")
    args = parser.parse_args(argv)
    chapters = list(SME_CHAPTERS) if args.sme else args.chapters

    print(f"Reading imports for {args.year} from SSB …")
    try:
        imports = imports_by_code(args.year)
    except SsbError as error:
        print(f"ERROR  {error}")
        return 1
    if not imports:
        print(f"ERROR  SSB has no import figures for {args.year}")
        return 1

    top = select(imports, top=args.top, chapters=chapters, per_chapter=args.per_chapter)
    texts = tariff_texts([t.code for t in top])

    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    suffix = "_sme" if args.sme else "_by_chapter" if chapters else ""
    path = EVAL_DIR / f"top_imports_{args.year}{suffix}.csv"
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(COLUMNS)
        for rank, item in enumerate(top, start=1):
            nb, en = texts.get(item.code, (None, None))
            writer.writerow(
                [rank, item.code, round(item.value_nok), "yes" if item.code in texts else "no", nb or "", en or "", item.description_en]
            )

    missing = sum(1 for t in top if t.code not in texts)
    print(f"{len(imports):,} codes with imports; {len(top)} written to {path}")
    if missing:
        print(f"  {missing} of them are not in the current tariff (changed or removed codes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
