import pytest
import requests

from tollvakt_etl import embeddings
from tollvakt_etl.embeddings import (
    EMBEDDING_DIMENSIONS,
    EmbeddingError,
    GeminiEmbedder,
    OllamaEmbedder,
    create_embedder,
)


class FakeResponse:
    def __init__(self, status_code, data=None):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self._data = data or {}
        self.text = str(self._data)

    def json(self):
        return self._data


def vector(value=0.1):
    return [value] * EMBEDDING_DIMENSIONS


@pytest.fixture
def calls(monkeypatch):
    """Records requests and answers them from a queue of responses."""
    recorded = {"requests": [], "responses": []}

    def fake_post(url, json=None, headers=None, timeout=None):
        recorded["requests"].append({"url": url, "json": json, "headers": headers})
        answer = recorded["responses"].pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(embeddings.requests, "post", fake_post)
    return recorded


def test_ollama_sends_document_prompts_and_returns_vectors(calls):
    calls["responses"].append(FakeResponse(200, {"embeddings": [vector(), vector(0.2)]}))

    result = OllamaEmbedder("http://localhost:11434/", "embeddinggemma").embed_documents(["a", "b"])

    assert result == [vector(), vector(0.2)]
    request = calls["requests"][0]
    assert request["url"] == "http://localhost:11434/api/embed"
    assert request["json"] == {
        "model": "embeddinggemma",
        "input": ["title: none | text: a", "title: none | text: b"],
    }


def test_gemini_asks_for_768_dimensions_with_the_key_in_a_header(calls):
    calls["responses"].append(FakeResponse(200, {"embeddings": [{"values": vector()}]}))

    embedder = GeminiEmbedder("secret", "gemini-embedding-001")
    assert embedder.embed_documents(["laks"]) == [vector()]

    request = calls["requests"][0]
    assert request["url"].endswith("/models/gemini-embedding-001:batchEmbedContents")
    assert request["headers"] == {"x-goog-api-key": "secret"}
    assert request["json"]["requests"][0] == {
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": "laks"}]},
        "taskType": "RETRIEVAL_DOCUMENT",
        "outputDimensionality": 768,
    }
    assert embedder.model == "gemini:gemini-embedding-001"


def test_waits_and_tries_again_on_rate_limits_and_lost_connections(calls):
    waits = []
    calls["responses"] += [
        FakeResponse(429),
        requests.ConnectionError(),
        FakeResponse(200, {"embeddings": [vector()]}),
    ]

    result = OllamaEmbedder("http://x", "m", sleep=waits.append).embed_documents(["a"])

    assert result == [vector()]
    assert waits == [1, 2]


def test_gives_up_after_the_last_attempt(calls):
    calls["responses"] += [FakeResponse(503)] * embeddings.MAX_ATTEMPTS

    with pytest.raises(EmbeddingError, match="503, also after 8 attempts"):
        GeminiEmbedder("k", "m", sleep=lambda _: None).embed_documents(["a"])


def test_does_not_retry_other_errors(calls):
    calls["responses"].append(FakeResponse(400, {"error": "bad request"}))

    with pytest.raises(EmbeddingError, match="answered 400"):
        GeminiEmbedder("k", "m", sleep=lambda _: None).embed_documents(["a"])
    assert len(calls["requests"]) == 1


def test_rejects_vectors_of_the_wrong_size_or_number(calls):
    calls["responses"].append(FakeResponse(200, {"embeddings": [[0.1] * 1024]}))
    with pytest.raises(EmbeddingError, match="size 1024"):
        OllamaEmbedder("http://x", "m").embed_documents(["a"])

    calls["responses"].append(FakeResponse(200, {"embeddings": [vector()]}))
    with pytest.raises(EmbeddingError, match="1 vectors for 2 texts"):
        OllamaEmbedder("http://x", "m").embed_documents(["a", "b"])


def test_create_embedder_reads_the_settings(monkeypatch):
    monkeypatch.setattr(embeddings, "load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.setenv("EMBEDDING_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_EMBEDDING_MODEL", "embeddinggemma")
    monkeypatch.delenv("OLLAMA_HOST", raising=False)
    embedder = create_embedder()
    assert embedder.model == "ollama:embeddinggemma"
    assert embedder.host == "http://localhost:11434"

    monkeypatch.setenv("EMBEDDING_PROVIDER", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(EmbeddingError, match="GEMINI_API_KEY is not set"):
        create_embedder()

    monkeypatch.setenv("EMBEDDING_PROVIDER", "")
    with pytest.raises(EmbeddingError, match="must be ollama or gemini"):
        create_embedder()
