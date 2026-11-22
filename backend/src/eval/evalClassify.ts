// Measures how often classification suggests the right code, with the test
// set in eval/classification-cases.json.
//
//   npm run eval:classify                 summary and one line per case
//   npm run eval:classify -- --verbose    also the model's reasons and questions
//   npm run eval:classify -- --save       also write eval/results/classify-<time>.json
//
// "candidates" is how often the right code was among the codes the model
// chose from: classification cannot do better than that. "first" and "top 3"
// are how often it was the first suggestion or among the suggestions. The
// confidence lines show whether "high" can be trusted more than "low".
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sequelize } from "../config/database.js";
import { classify, ClassificationUnavailableError, type Classification } from "../services/classifier.js";
import { SemanticSearchUnavailableError } from "../services/commodityService.js";
import { QueryRewriteUnavailableError } from "../services/queryRewriter.js";
import type { EvalCase } from "./evalSearch.js";

const CASES_FILE = path.join(process.cwd(), "eval", "classification-cases.json");
const RESULTS_DIR = path.join(process.cwd(), "eval", "results");

export interface CaseOutcome {
  // Place of the right code among the suggestions (1-3), or null
  suggested: number | null;
  // Place of the right code among the candidates, or null
  candidate: number | null;
  firstConfidence: string | null;
}

export function outcomeOf(result: Classification, expected: string): CaseOutcome {
  const suggestedIndex = result.suggestions.findIndex((s) => s.code === expected);
  const candidateIndex = result.candidates.indexOf(expected);
  return {
    suggested: suggestedIndex === -1 ? null : suggestedIndex + 1,
    candidate: candidateIndex === -1 ? null : candidateIndex + 1,
    firstConfidence: result.suggestions[0]?.confidence ?? null,
  };
}

const percent = (part: number, whole: number) =>
  `${part}/${whole} (${whole ? Math.round((part / whole) * 100) : 0}%)`;

async function main(): Promise<void> {
  const verbose = process.argv.includes("--verbose");
  const save = process.argv.includes("--save");
  const { cases } = JSON.parse(await readFile(CASES_FILE, "utf8")) as { cases: EvalCase[] };

  const rows: { case: EvalCase; outcome: CaseOutcome; result?: Classification; error?: string }[] = [];
  for (const evalCase of cases) {
    try {
      const result = await classify(evalCase.query, evalCase.lang);
      rows.push({ case: evalCase, outcome: outcomeOf(result, evalCase.expected), result });
    } catch (error) {
      if (
        error instanceof ClassificationUnavailableError ||
        error instanceof QueryRewriteUnavailableError ||
        error instanceof SemanticSearchUnavailableError
      ) {
        // Not set up: no point in trying the other cases
        console.log(`Not measured. ${error.message}`);
        return;
      }
      rows.push({
        case: evalCase,
        outcome: { suggested: null, candidate: null, firstConfidence: null },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const cell = (value: number | null) => (value ? String(value) : "-").padStart(10);
  console.log(`\n${"case".padEnd(24)}${"expected".padEnd(10)}${"candidate".padStart(10)}${"suggested".padStart(10)}  suggestions`);
  for (const { case: c, outcome, result, error } of rows) {
    const suggestions = error
      ? `ERROR ${error}`
      : (result?.suggestions ?? []).map((s) => `${s.code} (${s.confidence})`).join(", ") || "(none)";
    console.log(`${c.id.padEnd(24)}${c.expected.padEnd(10)}${cell(outcome.candidate)}${cell(outcome.suggested)}  ${suggestions}`);
    if (verbose && result) {
      for (const s of result.suggestions) console.log(`${"".padEnd(26)}${s.code}: ${s.reason}`);
      for (const q of result.missingInformation) console.log(`${"".padEnd(26)}? ${q}`);
    }
  }

  const total = rows.length;
  const count = (test: (o: CaseOutcome) => boolean) => rows.filter((r) => test(r.outcome)).length;
  console.log(`\nOf ${total} cases:\n`);
  console.log(`  right code among the candidates   ${percent(count((o) => o.candidate !== null), total)}`);
  console.log(`  right code suggested first        ${percent(count((o) => o.suggested === 1), total)}`);
  console.log(`  right code among the suggestions  ${percent(count((o) => o.suggested !== null), total)}`);

  console.log(`\nFirst suggestion right, by its confidence:\n`);
  for (const level of ["high", "medium", "low"]) {
    const withLevel = rows.filter((r) => r.outcome.firstConfidence === level);
    const right = withLevel.filter((r) => r.outcome.suggested === 1).length;
    console.log(`  ${level.padEnd(8)}${percent(right, withLevel.length)}`);
  }
  const errors = rows.filter((r) => r.error).length;
  if (errors) console.log(`\n${errors} case(s) failed and count as not found.`);

  if (save) {
    await mkdir(RESULTS_DIR, { recursive: true });
    const file = path.join(RESULTS_DIR, `classify-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(file, JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 2));
    console.log(`\nSaved ${file}`);
  }
}

// Run only as a command, not when a test imports outcomeOf()
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  try {
    await main();
  } finally {
    await sequelize.close();
  }
}
