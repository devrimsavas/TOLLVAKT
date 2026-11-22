import hashlib

from tests.fixtures import write_folder
from tollvakt_etl.embeddings import EMBEDDING_DIMENSIONS
from tollvakt_etl.norway.dataset import load_dataset
from tollvakt_etl.norway.embed import embed_missing, missing_texts
from tollvakt_etl.norway.load import import_dataset


class FakeEmbedder:
    """Gives every text a vector without a model; records what it was sent."""

    model = "fake:test"
    batch_size = 2

    def __init__(self):
        self.sent = []

    def embed_documents(self, texts):
        self.sent.extend(texts)
        return [[len(text) / 1000] + [0.0] * (EMBEDDING_DIMENSIONS - 1) for text in texts]


def imported(db, tmp_path):
    dataset, report = load_dataset(write_folder(tmp_path))
    import_dataset(db, dataset, report)


def commodity_texts(db):
    rows = db.execute(
        "SELECT search_text_nb, search_text_en FROM tariff_nodes WHERE node_type = 'commodity'"
    ).fetchall()
    return {text for row in rows for text in row if text}


def test_embeds_the_search_texts_of_commodities_in_both_languages(db, tmp_path):
    imported(db, tmp_path)
    embedder = FakeEmbedder()

    result = embed_missing(db, embedder)

    texts = commodity_texts(db)
    assert set(embedder.sent) == texts
    assert result.embedded == len(texts) == result.total
    # The key is the md5 PostgreSQL keeps for each text
    some_text = next(iter(texts))
    md5 = hashlib.md5(some_text.encode("utf-8")).hexdigest()
    assert db.execute(
        "SELECT count(*) FROM text_embeddings WHERE model = 'fake:test' AND text_hash = %s", (md5,)
    ).fetchone() == (1,)


def test_a_second_run_sends_nothing_and_a_reimport_keeps_the_vectors(db, tmp_path):
    imported(db, tmp_path)
    embed_missing(db, FakeEmbedder())

    imported(db, tmp_path)
    again = FakeEmbedder()
    result = embed_missing(db, again)

    assert again.sent == []
    assert result.embedded == 0
    assert result.total == len(commodity_texts(db))


def test_removes_vectors_of_texts_no_node_has_any_more(db, tmp_path):
    imported(db, tmp_path)
    embed_missing(db, FakeEmbedder())
    db.execute(
        "UPDATE tariff_nodes SET search_text_en = search_text_en || ' (changed)' "
        "WHERE code = '01012100'"
    )
    db.commit()

    embedder = FakeEmbedder()
    result = embed_missing(db, embedder)

    assert len(embedder.sent) == 1 and embedder.sent[0].endswith("(changed)")
    assert result.removed == 1
    assert result.total == len(commodity_texts(db))


def test_a_limited_trial_run_embeds_part_and_removes_nothing(db, tmp_path):
    imported(db, tmp_path)
    db.execute(
        "INSERT INTO text_embeddings (model, text_hash, embedding) VALUES ('fake:test', %s, %s::vector)",
        ("0" * 32, "[" + ",".join(["0.5"] * EMBEDDING_DIMENSIONS) + "]"),
    )
    db.commit()

    result = embed_missing(db, FakeEmbedder(), limit=3)

    assert result.embedded == 3
    assert result.removed == 0
    assert len(missing_texts(db, "fake:test")) == len(commodity_texts(db)) - 3


def test_vectors_of_other_models_are_left_alone(db, tmp_path):
    imported(db, tmp_path)
    embed_missing(db, FakeEmbedder())

    other = FakeEmbedder()
    other.model = "fake:other"
    embed_missing(db, other)

    assert db.execute(
        "SELECT model, count(*) FROM text_embeddings GROUP BY model ORDER BY model"
    ).fetchall() == [("fake:other", len(commodity_texts(db))), ("fake:test", len(commodity_texts(db)))]
