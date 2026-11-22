// The classifications a member has made, saved with the answer exactly as
// it was given, so the member can come back to it and print it later.
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import type { SearchLanguage } from "./commodityService.js";
import type { Classification, Confidence, Suggestion } from "./classifier.js";
import type { RewrittenQuery } from "./queryRewriter.js";

export interface SavedClassification {
  id: string;
  description: string;
  lang: SearchLanguage;
  model: string;
  rewritten: RewrittenQuery | null;
  suggestions: Suggestion[];
  missingInformation: string[];
  candidates: string[];
  createdAt: string;
}

// One line in the member's list
export interface ClassificationSummary {
  id: string;
  description: string;
  lang: SearchLanguage;
  // The first suggestion, or null when no code fitted
  topSuggestion: { code: string; confidence: Confidence } | null;
  suggestionCount: number;
  createdAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  public_id: string;
  description: string;
  lang: SearchLanguage;
  model: string;
  rewritten: RewrittenQuery | null;
  suggestions: Suggestion[];
  missing_information: string[];
  candidates: string[];
  created_at: Date;
}

function toSaved(row: Row): SavedClassification {
  return {
    id: row.public_id,
    description: row.description,
    lang: row.lang,
    model: row.model,
    rewritten: row.rewritten,
    suggestions: row.suggestions,
    missingInformation: row.missing_information,
    candidates: row.candidates,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function saveClassification(
  userId: number,
  lang: SearchLanguage,
  result: Classification,
): Promise<{ id: string; createdAt: string }> {
  const [rows] = await sequelize.query(
    `INSERT INTO classifications
       (user_id, description, lang, model, rewritten, suggestions, missing_information, candidates)
     VALUES (:userId, :description, :lang, :model, CAST(:rewritten AS jsonb), CAST(:suggestions AS jsonb),
             CAST(:missingInformation AS jsonb), CAST(:candidates AS jsonb))
     RETURNING public_id, created_at`,
    {
      replacements: {
        userId,
        description: result.description,
        lang,
        model: result.model,
        rewritten: result.rewritten ? JSON.stringify(result.rewritten) : null,
        suggestions: JSON.stringify(result.suggestions),
        missingInformation: JSON.stringify(result.missingInformation),
        candidates: JSON.stringify(result.candidates),
      },
    },
  );
  const row = (rows as { public_id: string; created_at: Date }[])[0]!;
  return { id: row.public_id, createdAt: new Date(row.created_at).toISOString() };
}

// Newest first
export async function listClassifications(
  userId: number,
  limit: number,
  offset: number,
): Promise<{ total: number; items: ClassificationSummary[] }> {
  const [count] = await sequelize.query<{ total: string }>(
    "SELECT count(*) AS total FROM classifications WHERE user_id = :userId",
    { type: QueryTypes.SELECT, replacements: { userId } },
  );
  const rows = await sequelize.query<Row>(
    `SELECT public_id, description, lang, suggestions, created_at
       FROM classifications
      WHERE user_id = :userId
      ORDER BY created_at DESC, id DESC
      LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements: { userId, limit, offset } },
  );
  return {
    total: Number(count!.total),
    items: rows.map((row) => {
      const first = row.suggestions[0];
      return {
        id: row.public_id,
        description: row.description,
        lang: row.lang,
        topSuggestion: first ? { code: first.code, confidence: first.confidence } : null,
        suggestionCount: row.suggestions.length,
        createdAt: new Date(row.created_at).toISOString(),
      };
    }),
  };
}

// Only the member's own: someone else's classification is "not found"
export async function getClassification(userId: number, id: string): Promise<SavedClassification | null> {
  if (!UUID.test(id)) return null;
  const [row] = await sequelize.query<Row>(
    `SELECT public_id, description, lang, model, rewritten, suggestions, missing_information,
            candidates, created_at
       FROM classifications
      WHERE user_id = :userId AND public_id = :id`,
    { type: QueryTypes.SELECT, replacements: { userId, id } },
  );
  return row ? toSaved(row) : null;
}

export async function deleteClassification(userId: number, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await sequelize.query<{ id: number }>(
    "DELETE FROM classifications WHERE user_id = :userId AND public_id = :id RETURNING id",
    { type: QueryTypes.SELECT, replacements: { userId, id } },
  );
  return rows.length > 0;
}
