import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingError,
  GeminiEmbedder,
  OllamaEmbedder,
  createEmbedder,
} from "../src/services/embeddings/embedder.js";
import { seedEmbeddings, seedTariffData } from "./helpers/tariffData.js";

function semantic(q: string, extra: Record<string, string> = {}) {
  return request(app).get("/api/commodities/search").query({ q, mode: "semantic", ...extra });
}

const codes = (res: request.Response) => res.body.hits.map((h: { code: string }) => h.code);

describe("GET /api/commodities/search?mode=semantic", () => {
  beforeEach(async () => {
    await seedTariffData();
  });

  it("finds the nearest codes by meaning, with the similarity as rank", async () => {
    await seedEmbeddings();

    const res = await semantic("cotton t-shirts");

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe("semantic");
    expect(codes(res)[0]).toBe("61091000");
    expect(res.body.hits[0].rank).toBeGreaterThan(0);
    expect(res.body.hits[0].rank).toBeLessThanOrEqual(1);
  });

  it("compares with both languages and lists each code once", async () => {
    await seedEmbeddings();

    const res = await semantic("skrotter", { lang: "en" });

    expect(codes(res)[0]).toBe("02011000");
    expect(new Set(codes(res)).size).toBe(codes(res).length);
    // The context is in the asked language
    expect(res.body.hits[0].context).toBe("Carcasses and half-carcasses");
  });

  it("leaves out expired codes", async () => {
    await seedEmbeddings();

    const res = await semantic("andre tekstilmaterialer");

    expect(codes(res)).not.toContain("61099000");
  });

  it("answers 503 when the vectors have not been created", async () => {
    const res = await semantic("bomull");

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("embed_norway");
  });

  it("answers 503 when no embedding model is set up", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "");
    const res = await semantic("bomull");
    vi.unstubAllEnvs();

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("EMBEDDING_PROVIDER");
  });

  it("rejects an unknown mode", async () => {
    const res = await request(app).get("/api/commodities/search").query({ q: "x", mode: "fuzzy" });
    expect(res.status).toBe(400);
  });
});

describe("embedders", () => {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0.1);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function answer(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("Ollama sends the query prompt and returns the vector", async () => {
    const fetchMock = answer(200, { embeddings: [vector] });

    const result = await new OllamaEmbedder("http://localhost:11434/", "embeddinggemma", 1000).embedQuery("laks");

    expect(result).toEqual(vector);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/api/embed");
    expect(JSON.parse(init.body)).toEqual({
      model: "embeddinggemma",
      input: "task: search result | query: laks",
    });
  });

  it("Gemini asks for a query vector of 768 dimensions with the key in a header", async () => {
    const fetchMock = answer(200, { embedding: { values: vector } });

    await new GeminiEmbedder("secret", "gemini-embedding-001", 1000).embedQuery("laks");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/models\/gemini-embedding-001:embedContent$/);
    expect(init.headers["x-goog-api-key"]).toBe("secret");
    expect(JSON.parse(init.body)).toMatchObject({
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    });
  });

  it("rejects error answers and vectors of the wrong size", async () => {
    answer(429, {});
    await expect(new GeminiEmbedder("k", "m", 1000).embedQuery("x")).rejects.toThrow("answered 429");

    answer(200, { embeddings: [[0.1, 0.2]] });
    await expect(new OllamaEmbedder("http://x", "m", 1000).embedQuery("x")).rejects.toThrow(EmbeddingError);
  });

  it("reports an unreachable model", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(new OllamaEmbedder("http://x", "m", 1000).embedQuery("x")).rejects.toThrow(
      "could not be reached",
    );
  });

  it("is chosen from the environment", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_EMBEDDING_MODEL", "embeddinggemma");
    expect(createEmbedder()?.model).toBe("ollama:embeddinggemma");

    vi.stubEnv("EMBEDDING_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(createEmbedder()).toBeNull();
  });
});

describe("GET /api/commodities/search?mode=hybrid", () => {
  beforeEach(async () => {
    await seedTariffData();
    await seedEmbeddings();
  });

  it("merges text and semantic results", async () => {
    const res = await request(app).get("/api/commodities/search").query({ q: "bomull", mode: "hybrid" });

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe("hybrid");
    expect(codes(res)[0]).toBe("61091000");
  });

  it("still searches codes for digits", async () => {
    const res = await request(app).get("/api/commodities/search").query({ q: "6109", mode: "hybrid" });
    expect(res.body.matched).toBe("code");
  });
});
