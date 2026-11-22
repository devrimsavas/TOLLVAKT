"""Embeds the search texts of the commodity codes.

Only texts without a vector for the current model are sent to the model,
so a re-import of an unchanged tariff costs nothing, and a stopped run
continues where it stopped: every batch is committed on its own.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass

import psycopg

from tollvakt_etl.embeddings import Embedder

# The search texts of current commodity nodes, in both languages, with the
# md5 hash PostgreSQL keeps for each (tariff_nodes.search_hash_*)
_TEXTS = """
    SELECT search_hash_nb AS text_hash, search_text_nb AS text FROM tariff_nodes
     WHERE node_type = 'commodity' AND search_text_nb IS NOT NULL
    UNION
    SELECT search_hash_en, search_text_en FROM tariff_nodes
     WHERE node_type = 'commodity' AND search_text_en IS NOT NULL
"""


@dataclass
class EmbedResult:
    model: str
    embedded: int
    removed: int
    total: int


def missing_texts(conn: psycopg.Connection, model: str) -> list[tuple[str, str]]:
    """(hash, text) of every search text without a vector from this model."""
    return conn.execute(
        f"""
        SELECT t.text_hash, t.text FROM ({_TEXTS}) t
         WHERE NOT EXISTS (
           SELECT 1 FROM text_embeddings e WHERE e.model = %s AND e.text_hash = t.text_hash
         )
         ORDER BY t.text_hash
        """,
        (model,),
    ).fetchall()


def remove_unused(conn: psycopg.Connection, model: str) -> int:
    """Deletes this model's vectors whose text no current node has any more."""
    with conn.transaction():
        cursor = conn.execute(
            f"""
            DELETE FROM text_embeddings e
             WHERE e.model = %s
               AND NOT EXISTS (SELECT 1 FROM ({_TEXTS}) t WHERE t.text_hash = e.text_hash)
            """,
            (model,),
        )
    return cursor.rowcount


def _vector_literal(vector: list[float]) -> str:
    # pgvector's text form: [0.1,0.2,...]
    return "[" + ",".join(repr(float(value)) for value in vector) + "]"


def _batches(items: list[tuple[str, str]], size: int) -> Iterator[list[tuple[str, str]]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def embed_missing(
    conn: psycopg.Connection,
    embedder: Embedder,
    *,
    limit: int | None = None,
    on_progress: Callable[[int, int], None] | None = None,
) -> EmbedResult:
    """Embeds missing texts batch by batch, then removes unused vectors."""
    todo = missing_texts(conn, embedder.model)
    if limit is not None:
        todo = todo[:limit]

    done = 0
    for batch in _batches(todo, embedder.batch_size):
        vectors = embedder.embed_documents([text for _, text in batch])
        with conn.transaction():
            with conn.cursor() as cursor:
                cursor.executemany(
                    "INSERT INTO text_embeddings (model, text_hash, embedding) "
                    "VALUES (%s, %s, %s::vector) ON CONFLICT DO NOTHING",
                    [
                        (embedder.model, text_hash, _vector_literal(vector))
                        for (text_hash, _), vector in zip(batch, vectors, strict=True)
                    ],
                )
        done += len(batch)
        if on_progress:
            on_progress(done, len(todo))

    # A trial run with --limit leaves the rest alone
    removed = remove_unused(conn, embedder.model) if limit is None else 0
    if done or removed:
        # Fresh statistics, or the planner may skip the vector index
        conn.execute("ANALYZE text_embeddings")
    row = conn.execute("SELECT count(*) FROM text_embeddings WHERE model = %s", (embedder.model,)).fetchone()
    conn.commit()
    return EmbedResult(model=embedder.model, embedded=done, removed=removed, total=int(row[0]) if row else 0)
