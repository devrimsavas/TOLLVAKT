// Measures how often each search method finds the right code, with the test
// set in eval/classification-cases.json.
//
//   npm run eval:search                  all methods
//   npm run eval:search -- --save        also write eval/results/search-<time>.json
//
// For each case and method it records the place of the right code among the
// first 50 results. The summary shows how often it is first, in the first 5,
// 10 and 20, and the mean reciprocal rank (1 for always first, 0 for never
// found). The classification step will hand the LLM about 20 candidates, so
// "top 20" is the number that matters most.
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { searchCommodities, type SearchLanguage, type SearchMode } from "../services/commodityService.js";

export interface EvalCase {
  id: string;
  query: string;
  lang: SearchLanguage;
  expected: string;
  note?: string;
}

const METHODS: SearchMode[] = ["text", "semantic", "hybrid"];
const DEPTH = 50;
const CUTOFFS = [1, 5, 10, 20];
const CASES_FILE = path.join(process.cwd(), "eval", "classification-cases.json");
const RESULTS_DIR = path.join(process.cwd(), "eval", "results");

// Place of the expected code (1 = first), or null if not among the results
export type Places = Record<string, number | null>;

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
  const { cases } = JSON.parse(await readFile(CASES_FILE, "utf8")) as { cases: EvalCase[] };

  const known = await currentCodes(cases.map((c) => c.expected));
  for (const c of cases.filter((c) => !known.has(c.expected))) {
    console.warn(`WARNING  ${c.id}: ${c.expected} is not a current commodity code`);
  }

  const results: { case: EvalCase; places: Places }[] = [];
  const unavailable = new Map<string, string>();

  for (const evalCase of cases) {
    const places: Places = {};
    for (const method of METHODS) {
      if (unavailable.has(method)) {
        places[method] = null;
        continue;
      }
      try {
        const { hits } = await searchCommodities(evalCase.query, evalCase.lang, DEPTH, method);
        const index = hits.findIndex((hit) => hit.code === evalCase.expected);
        places[method] = index === -1 ? null : index + 1;
      } catch (error) {
        // e.g. no embedding model set up: report it once, go on with the rest
        unavailable.set(method, error instanceof Error ? error.message : String(error));
        places[method] = null;
      }
    }
    results.push({ case: evalCase, places });
  }

  const place = (value: number | null | undefined) => (value ? String(value) : "-").padStart(8);
  console.log(`\n${"case".padEnd(24)}${"expected".padEnd(10)}${METHODS.map((m) => m.padStart(8)).join("")}  query`);
  for (const { case: c, places } of results) {
    console.log(
      `${c.id.padEnd(24)}${c.expected.padEnd(10)}${METHODS.map((m) => place(places[m])).join("")}  ${c.query}`,
    );
  }

  const active = METHODS.filter((m) => !unavailable.has(m));
  const summaries = active.map((m) => summarize(m, results.map((r) => r.places[m] ?? null)));
  console.log(`\nRight code found among the first N results (of ${cases.length} cases):\n`);
  console.log(`${"method".padEnd(10)}${CUTOFFS.map((n) => `top ${n}`.padEnd(13)).join("")}MRR`);
  for (const s of summaries) {
    console.log(
      `${s.method.padEnd(10)}${CUTOFFS.map((n) => percent(s.hits[n] ?? 0, s.cases)).join("")}${s.meanReciprocalRank.toFixed(3)}`,
    );
  }
  for (const [method, reason] of unavailable) {
    console.log(`\n${method}: not measured. ${reason}`);
  }

  if (save) {
    await mkdir(RESULTS_DIR, { recursive: true });
    const file = path.join(RESULTS_DIR, `search-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(
      file,
      JSON.stringify({ ranAt: new Date().toISOString(), summaries, results, unavailable: Object.fromEntries(unavailable) }, null, 2),
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
