import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { searchWords, toTsQuery } from "../src/services/commodityService.js";
import { seedTariffData } from "./helpers/tariffData.js";

beforeEach(async () => {
  await seedTariffData();
});

function search(query: Record<string, string>) {
  return request(app).get("/api/commodities/search").query(query);
}

describe("search words", () => {
  it("keeps letters, digits and inner hyphens only", () => {
    expect(searchWords("T-skjorte, av BOMULL!! 'or' & (x)")).toEqual(["t-skjorte", "av", "bomull", "or", "x"]);
    expect(searchWords("æøå --- ")).toEqual(["æøå"]);
    expect(toTsQuery(["t-skjorte", "bomull"], "&")).toBe("t-skjorte:* & bomull:*");
  });
});

describe("GET /api/commodities/search", () => {
  it("finds a code by words in its own text and the texts above it", async () => {
    const res = await search({ q: "t-skjorte bomull" });

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe("all");
    expect(res.body.hits.map((h: { code: string }) => h.code)).toEqual(["61091000"]);
    expect(res.body.hits[0].context).toContain("T-skjorter");
  });

  it("matches partly typed words", async () => {
    const res = await search({ q: "bomu" });
    expect(res.body.hits.map((h: { code: string }) => h.code)).toEqual(["61091000"]);
  });

  it("searches the English texts", async () => {
    const res = await search({ q: "cotton t-shirts", lang: "en" });
    expect(res.body.hits.map((h: { code: string }) => h.code)).toEqual(["61091000"]);
  });

  it("falls back to codes matching some of the words, best match first", async () => {
    const res = await search({ q: "skrotter bomull trikotasje" });

    expect(res.body.matched).toBe("any");
    // 61091000 matches two words (bomull, trikotasje), 02011000 one
    expect(res.body.hits.map((h: { code: string }) => h.code)).toEqual(["61091000", "02011000"]);
  });

  it("searches codes by digits, leaving out expired codes", async () => {
    const res = await search({ q: "6109.10" });
    expect(res.body.matched).toBe("code");
    expect(res.body.hits.map((h: { code: string }) => h.code)).toEqual(["61091000"]);

    const chapter = await search({ q: "61" });
    expect(chapter.body.hits.map((h: { code: string }) => h.code)).toEqual(["61091000"]);
  });

  it("returns no hits for punctuation only", async () => {
    const res = await search({ q: "!!! &&" });
    expect(res.status).toBe(200);
    expect(res.body.hits).toEqual([]);
  });

  it("rejects a missing query, an unknown language and a bad limit", async () => {
    expect((await search({})).status).toBe(400);
    expect((await search({ q: "x".repeat(201) })).status).toBe(400);
    expect((await search({ q: "bomull", lang: "de" })).status).toBe(400);
    expect((await search({ q: "bomull", limit: "0" })).status).toBe(400);
    expect((await search({ q: "bomull", limit: "51" })).status).toBe(400);
  });
});

describe("GET /api/commodities/:code", () => {
  it("returns the code with its path and the references above it", async () => {
    const res = await request(app).get("/api/commodities/6109.1000");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: "61091000", descriptionNb: "av bomull", unit: "KG" });
    expect(res.body.path.map((p: { code: string }) => p.code)).toEqual(["11", "6109"]);
    expect(res.body.references).toEqual([
      expect.objectContaining({ code: "TKV 061", attachedTo: "6109" }),
    ]);
  });

  it("returns current classifications", async () => {
    const res = await request(app).get("/api/commodities/02011000");
    expect(res.body.classifications).toEqual([{ code: "NA", description: "Næringsmiddel" }]);
  });

  it("returns 404 for an unknown code and 400 for a bad one", async () => {
    expect((await request(app).get("/api/commodities/99999999")).status).toBe(404);
    expect((await request(app).get("/api/commodities/6109")).status).toBe(400);
  });
});

describe("GET /api/countries", () => {
  it("lists countries with Norwegian and English names", async () => {
    const res = await request(app).get("/api/countries");

    expect(res.status).toBe(200);
    expect(res.body).toContainEqual({ code: "CN", nameNb: "Kina", nameEn: "China" });
    expect(res.body).toContainEqual({ code: "DE", nameNb: "Tyskland", nameEn: "Germany" });
    expect(res.body).toContainEqual({ code: "XB", nameNb: "Kanariøyene", nameEn: "Canary Islands" });
  });
});
