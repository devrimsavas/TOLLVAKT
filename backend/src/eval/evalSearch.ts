// Measures how often each search method finds the right code, with the test
// set in eval/classification-cases.json.
//
//   npm run eval:search                  all methods
//   npm run eval:search -- --save        also write eval/results/search-<time>.json
//   npm run eval:search -- --verbose     also print the language model's rewrites
//   npm run eval:search -- --cases eval/holdout-cases.json   another test set
//
// For each case and method it records the place of the right code among the
// first 50 results. The summary shows how often it is first, in the first 5,
// 10 and 20, and the mean reciprocal rank (1 for always first, 0 for never
// found). The classification step will hand the LLM about 20 candidates, so
// "top 20" is the number that matters most.
//
// It also records the first place of a code in the right subheading (same
// first 6 digits) and heading (first 4). If the right area is among the
// candidates but the exact code is not, search finds the area and the
// choice between close codes is left; that is a different problem than
// searching in the wrong place.
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import {
  searchCommodities,
  SemanticSearchUnavailableError,
  type SearchLanguage,
  type SearchMode,
} from "../services/commodityService.js";
import { QueryRewriteUnavailableError, type RewrittenQuery } from "../services/queryRewriter.js";

export interface EvalCase {
  id: string;
  query: string;
  lang: SearchLanguage;
  expected: string;
  note?: string;
}

const METHODS: SearchMode[] = ["text", "semantic", "hybrid", "expanded"];
const DEPTH = 50;
const CUTOFFS = [1, 5, 10, 20];
const DEFAULT_CASES = path.join("eval", "classification-cases.json");

// --cases <file> measures another test set, e.g. eval/holdout-cases.json
export function casesFile(argv: string[]): string {
  const index = argv.indexOf("--cases");
  const file = index !== -1 ? argv[index + 1] : undefined;
  return path.resolve(process.cwd(), file ?? DEFAULT_CASES);
}
const RESULTS_DIR = path.join(process.cwd(), "eval", "results");

// Place of the expected code (1 = first), or null if not among the results
export type Places = Record<string, number | null>;

// Levels of a match: the exact code, the same subheading, the same heading
export const LEVELS = [
  { name: "exact", digits: 8 },
  { name: "6-digit", digits: 6 },
  { name: "4-digit", digits: 4 },
] as const;

// First place (1 = first) of a code sharing the first `digits` digits, or null
export function placeOf(codes: string[], expected: string, digits: number): number | null {
  const prefix = expected.slice(0, digits);
  const index = codes.findIndex((code) => code.startsWith(prefix));
  return index === -1 ? null : index + 1;
}

export interface MethodSummary {
  method: string;
  cases: number;
  hits: Record<number, number>;
  meanReciprocalRank: number;
}

export function summarize(method: string, places: (number | null)[]): MethodSummary {
  const hits: Record<number, number> = {};
  for (const cutoff of CUTOFFS) {
    hits[cutoff] = places.filter((place) => place !== null && place <= cutoff).length;
  }
  const reciprocal = places.reduce<number>((sum, place) => sum + (place ? 1 / place : 0), 0);
  return {
    method,
    cases: places.length,
    hits,
    meanReciprocalRank: places.length ? reciprocal / places.length : 0,
  };
}

const percent = (part: number, whole: number) =>
  `${part}/${whole} (${whole ? Math.round((part / whole) * 100) : 0}%)`.padEnd(13);

async function currentCodes(codes: string[]): Promise<Set<string>> {
  const rows = await sequelize.query<{ code: string }>(
    `SELECT code FROM commodities
      WHERE code IN (:codes) AND (valid_to IS NULL OR valid_to >= current_date)`,
    { type: QueryTypes.SELECT, replacements: { codes } },
  );
  return new Set(rows.map((row) => row.code));
}

async function main(): Promise<void> {
  const save = process.argv.includes("--save");
  const verbose = process.argv.includes("--verbose");
  const { cases } = JSON.parse(await readFile(casesFile(process.argv), "utf8")) as { cases: EvalCase[] };

  const known = await currentCodes(cases.map((c) => c.expected));
  for (const c of cases.filter((c) => !known.has(c.expected))) {
    console.warn(`WARNING  ${c.id}: ${c.expected} is not a current commodity code`);
  }

  // places[level][method]
  const results: { case: EvalCase; places: Record<string, Places>; rewritten?: RewrittenQuery }[] = [];
  const unavailable = new Map<string, string>();
  const failures: { case: string; method: string; message: string }[] = [];

  for (const evalCase of cases) {
    const places: Record<string, Places> = Object.fromEntries(LEVELS.map((l) => [l.name, {}]));
    let rewritten: RewrittenQuery | undefined;
    for (const method of METHODS) {
      let codes: string[] = [];
      if (!unavailable.has(method)) {
        try {
          const result = await searchCommodities(evalCase.query, evalCase.lang, DEPTH, method);
          codes = result.hits.map((hit) => hit.code);
          rewritten ??= result.rewritten;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (error instanceof SemanticSearchUnavailableError || error instanceof QueryRewriteUnavailableError) {
            // Not set up: report it once, go on with the other methods
            unavailable.set(method, message);
          } else {
            // A failure for this case only (e.g. an unusable model answer):
            // it counts as not found, and the next case is tried
            failures.push({ case: evalCase.id, method, message });
          }
        }
      }
      for (const level of LEVELS) {
        places[level.name]![method] = placeOf(codes, evalCase.expected, level.digits);
      }
    }
    results.push(rewritten ? { case: evalCase, places, rewritten } : { case: evalCase, places });
  }

  const place = (value: number | null | undefined) => (value ? String(value) : "-").padStart(9);
  console.log(`\n${"case".padEnd(24)}${"expected".padEnd(10)}${METHODS.map((m) => m.padStart(9)).join("")}  query`);
  for (const { case: c, places } of results) {
    console.log(
      `${c.id.padEnd(24)}${c.expected.padEnd(10)}${METHODS.map((m) => place(places.exact![m])).join("")}  ${c.query}`,
    );
  }

  if (verbose) {
    console.log("\nRewrites by the language model:\n");
    for (const r of results.filter((r) => r.rewritten)) {
      console.log(`${r.case.id.padEnd(24)}nb: ${r.rewritten!.nb}\n${"".padEnd(24)}en: ${r.rewritten!.en}`);
    }
  }

  const active = METHODS.filter((m) => !unavailable.has(m));
  const summaries = active.map((m) => summarize(m, results.map((r) => r.places.exact![m] ?? null)));
  console.log(`\nRight code found among the first N results (of ${cases.length} cases):\n`);
  console.log(`${"method".padEnd(10)}${CUTOFFS.map((n) => `top ${n}`.padEnd(13)).join("")}MRR`);
  for (const s of summaries) {
    console.log(
      `${s.method.padEnd(10)}${CUTOFFS.map((n) => percent(s.hits[n] ?? 0, s.cases)).join("")}${s.meanReciprocalRank.toFixed(3)}`,
    );
  }
  console.log(`\nRight code or area among the first 20 results:\n`);
  console.log(`${"method".padEnd(10)}${LEVELS.map((l) => l.name.padEnd(13)).join("")}`);
  const areaSummaries = active.map((m) => ({
    method: m,
    top20: Object.fromEntries(
      LEVELS.map((l) => [l.name, summarize(m, results.map((r) => r.places[l.name]![m] ?? null)).hits[20] ?? 0]),
    ),
  }));
  for (const a of areaSummaries) {
    console.log(`${a.method.padEnd(10)}${LEVELS.map((l) => percent(a.top20[l.name] ?? 0, cases.length)).join("")}`);
  }

  if (failures.length) {
    console.log(`\nFailed searches (counted as not found):`);
    for (const f of failures) console.log(`  ${f.case} (${f.method}): ${f.message}`);
  }
  for (const [method, reason] of unavailable) {
    console.log(`\n${method}: not measured. ${reason}`);
  }

  if (save) {
    await mkdir(RESULTS_DIR, { recursive: true });
    const file = path.join(RESULTS_DIR, `search-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(
      file,
      JSON.stringify(
        {
          ranAt: new Date().toISOString(),
          summaries,
          areaSummaries,
          results,
          failures,
          unavailable: Object.fromEntries(unavailable),
        },
        null,
        2,
      ),
    );
    console.log(`\nSaved ${file}`);
  }
}

// Run only as a command, not when a test imports summarize()
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  try {
    await main();
  } finally {
    await sequelize.close();
  }
}
