import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fuseRankings, type SearchHit } from "../src/services/commodityService.js";
import { placeOf, summarize, type EvalCase } from "../src/eval/evalSearch.js";

const hit = (code: string): SearchHit => ({
  code,
  descriptionNb: null,
  descriptionEn: null,
  context: null,
  rank: 0,
});

describe("fuseRankings", () => {
  it("puts codes both lists found first, and keeps codes only one found", () => {
    const fused = fuseRankings(
      [
        [hit("A"), hit("B"), hit("C")],
        [hit("D"), hit("B"), hit("A")],
      ],
      10,
    );

    expect(fused.map((h) => h.code)).toEqual(["A", "B", "D", "C"]);
    expect(fused[0]!.rank).toBeCloseTo(1 / 61 + 1 / 63);
  });

  it("returns at most the limit", () => {
    expect(fuseRankings([[hit("A"), hit("B")], [hit("C")]], 2)).toHaveLength(2);
  });
});

describe("search evaluation", () => {
  it("summarizes places into hit counts and the mean reciprocal rank", () => {
    const summary = summarize("text", [1, 3, 12, null]);

    expect(summary.hits).toEqual({ 1: 1, 5: 2, 10: 2, 20: 3 });
    expect(summary.meanReciprocalRank).toBeCloseTo((1 + 1 / 3 + 1 / 12) / 4);
  });

  it("finds the first code in the same subheading or heading", () => {
    // Expected: men's cotton trousers; found: t-shirts, a men's suit, men's cotton shorts
    const codes = ["61091000", "62031100", "62034201"];

    expect(placeOf(codes, "62034209", 8)).toBeNull();
    expect(placeOf(codes, "62034209", 6)).toBe(3);
    expect(placeOf(codes, "62034209", 4)).toBe(2);
  });

  it("has a well-formed test set", () => {
    const { cases } = JSON.parse(readFileSync("eval/classification-cases.json", "utf8")) as { cases: EvalCase[] };

    expect(cases.length).toBeGreaterThanOrEqual(30);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(c.expected).toMatch(/^\d{8}$/);
      expect(["nb", "en"]).toContain(c.lang);
      expect(c.query.trim()).not.toBe("");
    }
  });
});
