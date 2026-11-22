"""Embedding models: turn texts into vectors for semantic search.

Locally the vectors come from Ollama (embeddinggemma), in production from
the Gemini API (gemini-embedding-001). Vectors from different models cannot
be compared, so each vector is stored with its model name, and the backend
must use the same model for the user's query.

Settings (etl/.env):

    EMBEDDING_PROVIDER=ollama   OLLAMA_HOST, OLLAMA_EMBEDDING_MODEL
    EMBEDDING_PROVIDER=gemini   GEMINI_API_KEY, GEMINI_EMBEDDING_MODEL
"""

from __future__ import annotations

import os
import time
from collections.abc import Callable
from typing import Any, Protocol

import requests
from dotenv import load_dotenv

from tollvakt_etl.config import ETL_ROOT

# Fixed by the database column (vector(768)); both models give this size
EMBEDDING_DIMENSIONS = 768

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# Responses worth trying again: rate limits (the Gemini free tier allows
# few tokens per minute) and passing server errors
RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_ATTEMPTS = 8
MAX_WAIT_SECONDS = 60


class EmbeddingError(RuntimeError):
    """The embedding model could not be reached or gave an unusable answer."""


class Embedder(Protocol):
    # Stored with every vector, e.g. "ollama:embeddinggemma"
    model: str
    # Texts per request
    batch_size: int

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...


def _check_vectors(vectors: list[list[float]], expected: int, model: str) -> list[list[float]]:
    if len(vectors) != expected:
        raise EmbeddingError(f"{model} returned {len(vectors)} vectors for {expected} texts")
    for vector in vectors:
        if len(vector) != EMBEDDING_DIMENSIONS:
            raise EmbeddingError(
                f"{model} returned vectors of size {len(vector)}; the database expects {EMBEDDING_DIMENSIONS}"
            )
    return vectors


def post_with_retry(
    url: str,
    body: dict[str, Any],
    *,
    headers: dict[str, str] | None = None,
    timeout: float,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """POSTs JSON, waiting and trying again on rate limits and server errors."""
    for attempt in range(MAX_ATTEMPTS):
        try:
            response = requests.post(url, json=body, headers=headers, timeout=timeout)
        except requests.RequestException as error:
            problem = f"could not be reached ({error.__class__.__name__})"
        else:
            if response.ok:
                return response.json()
            if response.status_code not in RETRY_STATUSES:
                raise EmbeddingError(f"answered {response.status_code}: {response.text[:300]}")
            problem = f"answered {response.status_code}"
        if attempt < MAX_ATTEMPTS - 1:
            sleep(min(MAX_WAIT_SECONDS, 2**attempt))
    raise EmbeddingError(f"{problem}, also after {MAX_ATTEMPTS} attempts")


class OllamaEmbedder:
    batch_size = 32

    def __init__(self, host: str, name: str, sleep: Callable[[float], None] = time.sleep) -> None:
        self.host = host.rstrip("/")
        self.name = name
        self.model = f"ollama:{name}"
        self._sleep = sleep

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # embeddinggemma's prompt for texts to be found (the backend uses the
        # matching query prompt)
        inputs = [f"title: none | text: {text}" for text in texts]
        try:
            data = post_with_retry(
                f"{self.host}/api/embed",
                {"model": self.name, "input": inputs},
                timeout=300,
                sleep=self._sleep,
            )
        except EmbeddingError as error:
            raise EmbeddingError(f"Ollama at {self.host} {error}") from error
        return _check_vectors(data.get("embeddings") or [], len(texts), self.model)


class GeminiEmbedder:
    # The most texts batchEmbedContents accepts in one request
    batch_size = 100

    def __init__(self, api_key: str, name: str, sleep: Callable[[float], None] = time.sleep) -> None:
        self.api_key = api_key
        self.name = name
        self.model = f"gemini:{name}"
        self._sleep = sleep

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        body = {
            "requests": [
                {
                    "model": f"models/{self.name}",
                    "content": {"parts": [{"text": text}]},
                    "taskType": "RETRIEVAL_DOCUMENT",
                    "outputDimensionality": EMBEDDING_DIMENSIONS,
                }
                for text in texts
            ]
        }
        try:
            data = post_with_retry(
                f"{GEMINI_BASE_URL}/models/{self.name}:batchEmbedContents",
                body,
                headers={"x-goog-api-key": self.api_key},
                timeout=120,
                sleep=self._sleep,
            )
        except EmbeddingError as error:
            raise EmbeddingError(f"Gemini {error}") from error
        vectors = [item.get("values") or [] for item in data.get("embeddings") or []]
        return _check_vectors(vectors, len(texts), self.model)


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise EmbeddingError(f"{name} is not set (etl/.env)")
    return value


def create_embedder() -> Embedder:
    """The embedder chosen in etl/.env."""
    load_dotenv(ETL_ROOT / ".env")
    provider = os.environ.get("EMBEDDING_PROVIDER", "").strip()
    if provider == "ollama":
        host = os.environ.get("OLLAMA_HOST", "").strip() or "http://localhost:11434"
        return OllamaEmbedder(host, _required("OLLAMA_EMBEDDING_MODEL"))
    if provider == "gemini":
        return GeminiEmbedder(_required("GEMINI_API_KEY"), _required("GEMINI_EMBEDDING_MODEL"))
    raise EmbeddingError("EMBEDDING_PROVIDER must be ollama or gemini (etl/.env)")
