// Embedding models: turn the user's search into a vector, to compare with the
// tariff vectors the ETL stored. Both must come from the same model, so the
// settings here must match the ETL's (etl/.env).
//
// EMBEDDING_PROVIDER=ollama   OLLAMA_HOST, OLLAMA_EMBEDDING_MODEL (local)
// EMBEDDING_PROVIDER=gemini   GEMINI_API_KEY, GEMINI_EMBEDDING_MODEL (production)
// EMBEDDING_PROVIDER=fake     tests only: word-based vectors without a model

import { providerSetupProblem } from "../../config/providerSettings.js";
import { postJsonWithRetry } from "../http.js";

// Fixed by the database column (vector(768))
export const EMBEDDING_DIMENSIONS = 768;

const DEFAULT_TIMEOUT_SECONDS = 30;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface Embedder {
  // Stored with every vector, e.g. "ollama:embeddinggemma"
  readonly model: string;
  embedQuery(text: string): Promise<number[]>;
}

// The model could not be reached or gave an unusable answer
export class EmbeddingError extends Error {}

function checkVector(vector: unknown, model: string): number[] {
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
    const size = Array.isArray(vector) ? vector.length : 0;
    throw new EmbeddingError(
      `${model} returned a vector of size ${size}; the database expects ${EMBEDDING_DIMENSIONS}`,
    );
  }
  return vector as number[];
}

function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  who: string,
): Promise<unknown> {
  return postJsonWithRetry(
    url,
    body,
    headers,
    timeoutMs,
    who,
    (message) => new EmbeddingError(message),
  );
}

export class OllamaEmbedder implements Embedder {
  readonly model: string;

  constructor(
    private readonly host: string,
    private readonly name: string,
    private readonly timeoutMs: number,
  ) {
    this.model = `ollama:${name}`;
  }

  async embedQuery(text: string): Promise<number[]> {
    const data = (await postJson(
      `${this.host.replace(/\/+$/, "")}/api/embed`,
      // embeddinggemma's prompt for search queries (the ETL uses the
      // matching prompt for the tariff texts)
      { model: this.name, input: `task: search result | query: ${text}` },
      {},
      this.timeoutMs,
      `Ollama at ${this.host}`,
    )) as { embeddings?: unknown[] };
    return checkVector(data.embeddings?.[0], this.model);
  }
}

export class GeminiEmbedder implements Embedder {
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    private readonly name: string,
    private readonly timeoutMs: number,
  ) {
    this.model = `gemini:${name}`;
  }

  async embedQuery(text: string): Promise<number[]> {
    const data = (await postJson(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(this.name)}:embedContent`,
      {
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
      { "x-goog-api-key": this.apiKey },
      this.timeoutMs,
      "Gemini",
    )) as { embedding?: { values?: unknown } };
    return checkVector(data.embedding?.values, this.model);
  }
}

// For tests: each word adds 1 to one position, so texts sharing words get
// similar vectors. Tests seed the tariff vectors with the same function.
export function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let hash = 2166136261;
    for (const char of word) {
      hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0;
    }
    vector[hash % EMBEDDING_DIMENSIONS]! += 1;
  }
  // A vector of zeros has no direction, so cosine distance is undefined
  if (!vector.some((value) => value !== 0)) vector[0] = 1;
  return vector;
}

export class FakeEmbedder implements Embedder {
  readonly model = "fake";

  async embedQuery(text: string): Promise<number[]> {
    return fakeEmbedding(text);
  }
}

// The settings each provider needs, besides EMBEDDING_PROVIDER itself
const EMBEDDING_SETTINGS = {
  ollama: ["OLLAMA_EMBEDDING_MODEL"],
  gemini: ["GEMINI_API_KEY", "GEMINI_EMBEDDING_MODEL"],
};

// Why createEmbedder() returns null, for the error message
export function embedderSetupProblem(): string {
  return providerSetupProblem("EMBEDDING_PROVIDER", EMBEDDING_SETTINGS);
}

// The embedder chosen in the environment, or null when semantic search is
// not configured. Read on every call, so tests can set their own values.
export function createEmbedder(): Embedder | null {
  const env = process.env;
  const timeoutMs =
    Number(env.EMBEDDING_TIMEOUT_SECONDS ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

  switch (env.EMBEDDING_PROVIDER?.trim()) {
    case "ollama":
      if (!env.OLLAMA_EMBEDDING_MODEL) return null;
      return new OllamaEmbedder(
        env.OLLAMA_HOST || "http://localhost:11434",
        env.OLLAMA_EMBEDDING_MODEL,
        timeoutMs,
      );
    case "gemini":
      if (!env.GEMINI_API_KEY || !env.GEMINI_EMBEDDING_MODEL) return null;
      return new GeminiEmbedder(
        env.GEMINI_API_KEY,
        env.GEMINI_EMBEDDING_MODEL,
        timeoutMs,
      );
    case "fake":
      return new FakeEmbedder();
    default:
      return null;
  }
}
