// Suggests commodity codes for an importer's description of a product.
//
// 1. Expanded search finds candidate codes (the query as written and as
//    rewritten into the tariff's wording, text and semantic search).
// 2. A language model reads the candidates' paths in the tariff and picks up
//    to three, with its reasons, how sure it is, and what it would need to
//    know to be surer.
//
// The model may only pick from the candidates: a code it makes up is
// dropped. Suggestions are help for the importer, not a binding decision;
// Tolletaten's binding ruling (BKU) is the way to certainty.
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { searchCommodities, type SearchLanguage } from "./commodityService.js";
import {
  createLlm,
  generateJsonWithRetry,
  llmSetupProblem,
  type JsonSchema,
} from "./llm/llm.js";
import type { RewrittenQuery } from "./queryRewriter.js";

export const CANDIDATES = 20;
export const MAX_SUGGESTIONS = 3;

export type Confidence = "high" | "medium" | "low";

export interface Suggestion {
  code: string;
  descriptionNb: string | null;
  descriptionEn: string | null;
  // The path in the tariff, in the asked language
  context: string | null;
  reason: string;
  confidence: Confidence;
}

export interface Classification {
  description: string;
  rewritten: RewrittenQuery | null;
  suggestions: Suggestion[];
  // Questions whose answers would decide between the suggestions
  missingInformation: string[];
  // The codes the model chose from, best search match first
  candidates: string[];
  model: string;
}

// No language model is set up
export class ClassificationUnavailableError extends Error {}

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["code", "reason", "confidence"],
      },
    },
    missingInformation: { type: "array", items: { type: "string" } },
  },
  required: ["suggestions", "missingInformation"],
};

const LANGUAGE_NAMES: Record<SearchLanguage, string> = {
  nb: "Norwegian (bokmål)",
  en: "English",
};

function systemPrompt(language: SearchLanguage): string {
  return `You are an expert in classifying goods in the Norwegian customs tariff (Tolltariffen, based on the Harmonized System).

You get an importer's description of a product and a numbered list of candidate commodity codes, each with its full path in the tariff (section > chapter > heading > subheadings > code).

Choose the codes that fit the product best, most likely first, at most ${MAX_SUGGESTIONS}:
- Choose only codes from the candidate list. Never invent a code.
- Decide by the wording of the headings and subheadings in the path, as the General Interpretative Rules say: titles of sections and chapters are only a guide.
- Check every level of the path against the product: material, knitted or not, fresh/chilled/frozen, prepared or not, use, power source, for men/women/children, size or weight limits.
- "Other" ("andre", "ellers") at a level covers what the levels beside it do not.
- A finished article is classified as that kind of article, not as the raw material or semi-finished form it is made of (plates, sheets, strip, bars, granules, primary forms). If the product is a finished article and the candidates are only such materials, none of them fits.
- Give fewer than ${MAX_SUGGESTIONS} codes if fewer fit; give none if no candidate fits.

For each code give a short reason that refers to the path, and your confidence: "high" if the description clearly fits and no other candidate does, "medium" if it fits but a detail is unknown, "low" if it is a guess.
In "missingInformation", list short questions to the importer whose answers would decide between the codes (e.g. the material, whether it is knitted). Leave it empty if nothing is missing. If no candidate fits, say there what kind of heading the product belongs to instead.

Write the reasons and questions in ${LANGUAGE_NAMES[language]}. Answer only with JSON.`;
}

interface CandidateRow {
  code: string;
  description_nb: string | null;
  description_en: string | null;
  context: string | null;
  path_en: string | null;
}

async function candidateDetails(
  codes: string[],
  language: SearchLanguage,
): Promise<Map<string, CandidateRow>> {
  if (codes.length === 0) return new Map();
  const contextColumn = language === "nb" ? "search_text_nb" : "search_text_en";
  const rows = await sequelize.query<CandidateRow>(
    `SELECT code, description_nb, description_en, ${contextColumn} AS context, search_text_en AS path_en
       FROM tariff_nodes
      WHERE node_type = 'commodity' AND code IN (:codes)`,
    { type: QueryTypes.SELECT, replacements: { codes } },
  );
  return new Map(rows.map((row) => [row.code, row]));
}

// "Section > Chapter > ... > Code" -> "Chapter > ... > Code"
export function withoutSection(path: string): string {
  const cut = path.indexOf(" > ");
  return cut === -1 ? path : path.slice(cut + 3);
}

export async function classify(
  description: string,
  language: SearchLanguage,
): Promise<Classification> {
  const llm = createLlm();
  if (!llm) {
    throw new ClassificationUnavailableError(
      `No language model is set up: ${llmSetupProblem()}`,
    );
  }

  const search = await searchCommodities(
    description,
    language,
    CANDIDATES,
    "expanded",
  );
  const candidates = search.hits.map((hit) => hit.code);
  const details = await candidateDetails(candidates, language);

  if (candidates.length === 0) {
    return {
      description,
      rewritten: search.rewritten ?? null,
      suggestions: [],
      missingInformation: [],
      candidates,
      model: llm.model,
    };
  }

  // The English path: the model reasons best in English, and the English
  // tariff is an official translation with the same structure. The section
  // title is left out: long, and of no help to tell candidates apart.
  const list = candidates
    .map((code, index) => {
      const path =
        details.get(code)?.path_en ?? search.hits[index]?.context ?? "";
      return `${index + 1}. ${code}: ${withoutSection(path)}`;
    })
    .join("\n");
  const answer = await generateJsonWithRetry(llm, {
    system: systemPrompt(language),
    prompt: `Importer's description: ${JSON.stringify(description)}\n\nCandidate codes:\n${list}`,
    schema: SCHEMA,
  });

  const allowed = new Set(candidates);
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const item of answer.suggestions as {
    code: string;
    reason: string;
    confidence: Confidence;
  }[]) {
    // Models sometimes write codes with dots ("6109.1000")
    const code = item.code.replace(/[.\s]/g, "");
    if (
      !allowed.has(code) ||
      seen.has(code) ||
      suggestions.length >= MAX_SUGGESTIONS
    )
      continue;
    seen.add(code);
    const row = details.get(code);
    suggestions.push({
      code,
      descriptionNb: row?.description_nb ?? null,
      descriptionEn: row?.description_en ?? null,
      context: row?.context ?? null,
      reason: item.reason.trim(),
      confidence: item.confidence,
    });
  }

  return {
    description,
    rewritten: search.rewritten ?? null,
    suggestions,
    missingInformation: (answer.missingInformation as string[])
      .map((q) => q.trim())
      .filter(Boolean),
    candidates,
    model: llm.model,
  };
}
