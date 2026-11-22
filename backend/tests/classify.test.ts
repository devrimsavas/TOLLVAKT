import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { outcomeOf } from "../src/eval/evalClassify.js";
import { withoutSection, type Classification } from "../src/services/classifier.js";
import { FakeLlm, type JsonRequest } from "../src/services/llm/llm.js";
import { seedEmbeddings, seedTariffData } from "./helpers/tariffData.js";

// The fake model: the rewrite for the search, then the answer the test sets
function fakeModel(classification: (req: JsonRequest) => Record<string, unknown>) {
  FakeLlm.answer = (req) =>
    "suggestions" in req.schema.properties ? classification(req) : { nb: "t-skjorter av bomull", en: "cotton t-shirts" };
}

function classify(body: Record<string, unknown>) {
  return request(app).post("/api/classify").send(body);
}

describe("POST /api/classify", () => {
  beforeEach(async () => {
    await seedTariffData();
    await seedEmbeddings();
  });

  afterEach(() => {
    FakeLlm.answer = () => ({});
    vi.unstubAllEnvs();
  });

  it("returns the model's suggestions with the tariff texts", async () => {
    fakeModel(() => ({
      suggestions: [{ code: "6109.1000", reason: "Strikket t-skjorte av bomull", confidence: "high" }],
      missingInformation: [],
    }));

    const res = await classify({ description: "T-skjorte i bomull", lang: "nb" });

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([
      expect.objectContaining({
        code: "61091000",
        descriptionNb: "av bomull",
        reason: "Strikket t-skjorte av bomull",
        confidence: "high",
      }),
    ]);
    expect(res.body.suggestions[0].context).toContain("T-skjorter");
    expect(res.body.candidates).toContain("61091000");
    expect(res.body.rewritten).toEqual({ nb: "t-skjorter av bomull", en: "cotton t-shirts" });
    expect(res.body.model).toBe("fake");
  });

  it("gives the model the candidates with their English paths, and asks for the reasons in the user's language", async () => {
    let seen: JsonRequest | undefined;
    fakeModel((req) => {
      seen = req;
      return { suggestions: [], missingInformation: [] };
    });

    await classify({ description: "T-skjorte i bomull", lang: "nb" });

    expect(seen!.prompt).toContain('Importer\'s description: "T-skjorte i bomull"');
    expect(seen!.prompt).toMatch(/1\. 61091000: T-shirts, singlets and other vests.* > Of cotton/);
    // The section title is left out
    expect(seen!.prompt).not.toContain("Textiles and textile articles");
    expect(seen!.system).toContain("Norwegian (bokmål)");
    expect(seen!.system).toContain("Never invent a code");
  });

  it("drops codes that were not candidates, repeats, and more than three", async () => {
    fakeModel(() => ({
      suggestions: [
        { code: "99999999", reason: "made up", confidence: "high" },
        { code: "61091000", reason: "a", confidence: "medium" },
        { code: "61091000", reason: "again", confidence: "low" },
      ],
      missingInformation: ["Er den strikket?", "  "],
    }));

    const res = await classify({ description: "T-skjorte i bomull" });

    expect(res.body.suggestions.map((s: { code: string }) => s.code)).toEqual(["61091000"]);
    expect(res.body.missingInformation).toEqual(["Er den strikket?"]);
  });

  it("answers 503 when no language model is set up, and when the model's answer stays unusable", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    expect((await classify({ description: "T-skjorte" })).status).toBe(503);
    vi.unstubAllEnvs();

    fakeModel(() => ({ suggestions: [{ code: "61091000", reason: "x", confidence: "certain" }], missingInformation: [] }));
    const res = await classify({ description: "T-skjorte i bomull" });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("suggestions[0].confidence");
  });

  it("rejects a missing or too long description and an unknown language", async () => {
    expect((await classify({})).status).toBe(400);
    expect((await classify({ description: "x".repeat(501) })).status).toBe(400);
    expect((await classify({ description: "x", lang: "de" })).status).toBe(400);
  });
});

describe("withoutSection", () => {
  it("drops the first level of a path", () => {
    expect(withoutSection("Section > Chapter > Code")).toBe("Chapter > Code");
    expect(withoutSection("Only")).toBe("Only");
  });
});

describe("classification evaluation", () => {
  it("finds the places of the right code among suggestions and candidates", () => {
    const result = {
      suggestions: [
        { code: "A", confidence: "medium" },
        { code: "B", confidence: "low" },
      ],
      candidates: ["C", "B", "A"],
    } as unknown as Classification;

    expect(outcomeOf(result, "B")).toEqual({ suggested: 2, candidate: 2, firstConfidence: "medium" });
    expect(outcomeOf(result, "C")).toEqual({ suggested: null, candidate: 1, firstConfidence: "medium" });
  });
});
