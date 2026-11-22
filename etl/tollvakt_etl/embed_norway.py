"""Create the vectors for semantic search, after an import.

Usage (from the etl/ folder, with the venv active):

    python -m tollvakt_etl.embed_norway              # all texts without a vector
    python -m tollvakt_etl.embed_norway --limit 100  # a short trial

The model comes from etl/.env (EMBEDDING_PROVIDER). Only new or changed
texts are sent, and a stopped run continues where it stopped.
"""

from __future__ import annotations

import argparse
import sys

from tollvakt_etl.db import connect
from tollvakt_etl.embeddings import EmbeddingError, create_embedder
from tollvakt_etl.norway.embed import embed_missing, missing_texts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Embed the tariff texts for semantic search")
    parser.add_argument("--limit", type=int, help="embed at most this many texts (a trial run)")
    args = parser.parse_args(argv)

    try:
        embedder = create_embedder()
    except EmbeddingError as error:
        print(f"ERROR  {error}")
        return 1

    with connect() as conn:
        missing = len(missing_texts(conn, embedder.model))
        print(f"Model {embedder.model}: {missing:,} texts without a vector")

        def progress(done: int, total: int) -> None:
            print(f"  {done:>7,} / {total:,}", flush=True)

        try:
            result = embed_missing(conn, embedder, limit=args.limit, on_progress=progress)
        except EmbeddingError as error:
            # Batches already done are saved; the next run continues from here
            print(f"ERROR  {error}")
            return 1

    print(f"\nEmbedded {result.embedded:,}, removed {result.removed:,} unused, {result.total:,} vectors for {result.model}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
