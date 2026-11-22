import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import {
  FakeLlm,
  GeminiLlm,
  LlmError,
  OllamaLlm,
  createLlm,
  parseJsonAnswer,
  type JsonSchema,
} from "../src/services/llm/llm.js";
import { rewriteQuery } from "../src/services/queryRewriter.js";
import { seedEmbeddings, seedTariffData } from "./helpers/tariffData.js";

const schema: JsonSchema = {
  type: "object",
  properties: { nb: { type: "string" }, en: { type: "string" } },
  required: ["nb", "en"],
};

describe("GET /api/commodities/search?mode=expanded", () => {
  beforeEach(async () => {
    await seedTariffData();
    await seedEmbeddings();
  });

  afterEach(() => {
    FakeLlm.answer = () => ({});
    vi.unstubAllEnvs();
  });

  it("finds a code through the rewrite when the words as written match nothing", async () => {
    FakeLlm.answer = () => ({ nb: "t-skjorter av bomull", en: "cotton t-shirts" });

    const res = await request(app)
      .get("/api/commodities/search")
      .query({ q: "tees i økologisk stoff", mode: "expanded" });

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe("expanded");
    expect(res.body.rewritten).toEqual({ nb: "t-skjorter av bomull", en: "cotton t-shirts" });
    expect(res.body.hits[0].code).toBe("61091000");
    // The context is in the asked language, also for hits from the English search
    expect(res.body.hits[0].context).toContain("T-skjorter");
  });

  it("sends the query to the model with the system instructions", async () => {
    const seen: string[] = [];
    FakeLlm.answer = (req) => {
      seen.push(req.prompt, req.system);
      return { nb: "x", en: "x" };
    };

    await rewriteQuery("Kosebamse");

    expect(seen[0]).toBe('Importer\'s description: "Kosebamse"');
    expect(seen[1]).toContain("Norwegian customs tariff");
  });

  it("tries once more when the model's answer is unusable", async () => {
    let calls = 0;
    FakeLlm.answer = () => (++calls === 1 ? { nb: "only one language" } : { nb: "leketøy", en: "toys" });

    expect(await rewriteQuery("Kosebamse")).toEqual({ nb: "leketøy", en: "toys" });
    expect(calls).toBe(2);
  });

  it("answers 503 when no language model is set up", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    const res = await request(app).get("/api/commodities/search").query({ q: "bomull", mode: "expanded" });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("LLM_PROVIDER");
  });

  it("answers 503 when the model gives an unusable answer", async () => {
    FakeLlm.answer = () => ({ nb: "only one language" });
    const res = await request(app).get("/api/commodities/search").query({ q: "bomull", mode: "expanded" });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('"en"');
  });
});

describe("language models", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function answer(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("Ollama asks for the schema at temperature 0 and parses the answer", async () => {
    const fetchMock = answer(200, { message: { content: '{"nb":"leketøy","en":"toys"}' } });

    const result = await new OllamaLlm("http://localhost:11434", "gemma4:12b", 1000).generateJson({
      system: "sys",
      prompt: "q",
      schema,
    });

    expect(result).toEqual({ nb: "leketøy", en: "toys" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "gemma4:12b", format: schema, stream: false, options: { temperature: 0 } });
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "q" },
    ]);
  });

  it("Gemini asks for JSON with the schema and the key in a header", async () => {
    const fetchMock = answer(200, { candidates: [{ content: { parts: [{ text: '{"nb":"a","en":"b"}' }] } }] });

    const result = await new GeminiLlm("secret", "gemini-x", 1000).generateJson({ system: "sys", prompt: "q", schema });

    expect(result).toEqual({ nb: "a", en: "b" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/models\/gemini-x:generateContent$/);
    expect(init.headers["x-goog-api-key"]).toBe("secret");
    expect(JSON.parse(init.body).generationConfig).toEqual({
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0,
    });
  });

  it("rejects answers that are not JSON or miss a property", () => {
    expect(() => parseJsonAnswer("not json", schema, "m")).toThrow(LlmError);
    expect(() => parseJsonAnswer('["a"]', schema, "m")).toThrow("JSON object");
    expect(() => parseJsonAnswer('{"nb":"a","en":3}', schema, "m")).toThrow('"en"');
  });

  it("accepts JSON wrapped in a code fence or a sentence", () => {
    expect(parseJsonAnswer('```json\n{"nb":"a","en":"b"}\n```', schema, "m")).toEqual({ nb: "a", en: "b" });
    expect(parseJsonAnswer('Here it is: {"nb":"a","en":"b"}', schema, "m")).toEqual({ nb: "a", en: "b" });
  });

  it("reports error answers and an unreachable model", async () => {
    answer(429, {});
    await expect(new GeminiLlm("k", "m", 1000).generateJson({ system: "", prompt: "", schema })).rejects.toThrow(
      "answered 429",
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(
      new OllamaLlm("http://x", "m", 1000).generateJson({ system: "", prompt: "", schema }),
    ).rejects.toThrow("could not be reached");
  });

  it("is chosen from the environment", () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_LLM_MODEL", "gemma4:12b");
    expect(createLlm()?.model).toBe("ollama:gemma4:12b");

    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_LLM_MODEL", "");
    expect(createLlm()).toBeNull();
  });
});
