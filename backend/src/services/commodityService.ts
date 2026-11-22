// Search in the tariff tree and details of one commodity code.
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { createEmbedder, embedderSetupProblem } from "./embeddings/embedder.js";
import { rewriteQuery, type RewrittenQuery } from "./queryRewriter.js";

export type SearchLanguage = "nb" | "en";

export const MAX_SEARCH_WORDS = 10;

const CONFIG: Record<SearchLanguage, { vector: string; config: string }> = {
  nb: { vector: "search_vector_nb", config: "norwegian" },
  en: { vector: "search_vector_en", config: "english" },
};

export type SearchMode = "text" | "semantic" | "hybrid" | "expanded";

// Candidates each method contributes to a hybrid or expanded search
const HYBRID_CANDIDATES = 50;
// Reciprocal rank fusion constant; 60 is the usual choice. A larger value
// flattens the difference between first and later places.
const RRF_K = 60;

// Semantic search cannot run: no embedding model is set up, or the ETL has
// not created vectors with it yet
export class SemanticSearchUnavailableError extends Error {}

export interface SearchHit {
  code: string;
  descriptionNb: string | null;
  descriptionEn: string | null;
  // The texts from the section down to the code, in the search language
  context: string | null;
  rank: number;
}

export interface SearchResult {
  query: string;
  // "all": every word matched; "any": nothing matched all words, so codes
  // matching some of them are shown; "code": digits matched the start of
  // codes; "semantic": nearest in meaning (rank is the cosine similarity);
  // "hybrid": text and semantic results merged (rank is the fused score);
  // "expanded": like hybrid, also with the query rewritten into the tariff's
  // wording by a language model
  matched: "all" | "any" | "code" | "semantic" | "hybrid" | "expanded";
  hits: SearchHit[];
  // The rewritten query (mode "expanded" only)
  rewritten?: RewrittenQuery;
}

// The words of a search, safe to put into to_tsquery: letters, digits and
// inner hyphens only (e.g. "t-skjorte")
export function searchWords(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? [];
  return [...new Set(words)].slice(0, MAX_SEARCH_WORDS);
}

// "bomull t-skjorte" -> "bomull:* & t-skjorte:*": every word, as a prefix,
// so partly typed words match too
export function toTsQuery(words: string[], operator: "&" | "|"): string {
  return words.map((w) => `${w}:*`).join(` ${operator} `);
}

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());

async function searchByText(
  words: string[],
  operator: "&" | "|",
  language: SearchLanguage,
  limit: number,
  contextLanguage: SearchLanguage = language,
): Promise<SearchHit[]> {
  const { vector, config } = CONFIG[language];
  // With "|", codes matching more of the words come first; the text rank
  // only orders codes matching the same number of words
  const wordQueries = words.map((_, i) => `to_tsquery(:config, :word${i})`);
  const matchedWords = wordQueries
    .map((q) => `(n.${vector} @@ ${q})::int`)
    .join(" + ");
  const wordReplacements = Object.fromEntries(words.map((w, i) => [`word${i}`, `${w}:*`]));
  const contextColumn = contextLanguage === "nb" ? "n.search_text_nb" : "n.search_text_en";
  const rows = await sequelize.query<{
    code: string;
    description_nb: string | null;
    description_en: string | null;
    context: string | null;
    rank: number;
  }>(
    `SELECT n.code, n.description_nb, n.description_en, ${contextColumn} AS context,
            ts_rank_cd(n.${vector}, q) AS rank,
            ${matchedWords} AS matched_words
       FROM tariff_nodes n
       JOIN commodities c ON c.code = n.code
       CROSS JOIN to_tsquery(:config, :tsquery) q
      WHERE n.node_type = 'commodity'
        AND n.${vector} @@ q
        AND (c.valid_to IS NULL OR c.valid_to >= :today)
      ORDER BY matched_words DESC, rank DESC, n.code
      LIMIT :limit`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        config,
        tsquery: toTsQuery(words, operator),
        today: today(),
        limit,
        ...wordReplacements,
      },
    },
  );
  return rows.map((r) => ({
    code: r.code,
    descriptionNb: r.description_nb,
    descriptionEn: r.description_en,
    context: r.context,
    rank: Number(r.rank),
  }));
}

async function searchByCode(
  digits: string,
  language: SearchLanguage,
  limit: number,
): Promise<SearchHit[]> {
  const contextColumn = language === "nb" ? "n.search_text_nb" : "n.search_text_en";
  const rows = await sequelize.query<{
    code: string;
    description_nb: string | null;
    description_en: string | null;
    context: string | null;
  }>(
    `SELECT n.code, n.description_nb, n.description_en, ${contextColumn} AS context
       FROM tariff_nodes n
       JOIN commodities c ON c.code = n.code
      WHERE n.node_type = 'commodity'
        AND n.code LIKE :prefix
        AND (c.valid_to IS NULL OR c.valid_to >= :today)
      ORDER BY n.code
      LIMIT :limit`,
    {
      type: QueryTypes.SELECT,
      replacements: { prefix: `${digits}%`, today: today(), limit },
    },
  );
  return rows.map((r) => ({
    code: r.code,
    descriptionNb: r.description_nb,
    descriptionEn: r.description_en,
    context: r.context,
    rank: 1,
  }));
}

// pgvector's version, read once: iterative index scans exist from 0.8
let iterativeScan: Promise<boolean> | undefined;

export function supportsIterativeScan(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > 0 || minor >= 8;
}

function hasIterativeScan(): Promise<boolean> {
  iterativeScan ??= sequelize
    .query<{ extversion: string }>("SELECT extversion FROM pg_extension WHERE extname = 'vector'", {
      type: QueryTypes.SELECT,
    })
    .then(([row]) => (row ? supportsIterativeScan(row.extversion) : false));
  return iterativeScan;
}

async function searchBySimilarity(
  query: string,
  language: SearchLanguage,
  limit: number,
): Promise<SearchHit[]> {
  const embedder = createEmbedder();
  if (!embedder) {
    throw new SemanticSearchUnavailableError(
      `Semantic search is not set up: ${embedderSetupProblem()}`,
    );
  }
  const [stored] = await sequelize.query(
    "SELECT 1 FROM text_embeddings WHERE model = :model LIMIT 1",
    { type: QueryTypes.SELECT, replacements: { model: embedder.model } },
  );
  if (!stored) {
    throw new SemanticSearchUnavailableError(
      `There are no vectors from ${embedder.model} yet. Run: python -m tollvakt_etl.embed_norway`,
    );
  }

  const vector = `[${(await embedder.embedQuery(query)).join(",")}]`;
  const contextColumn = language === "nb" ? "n.search_text_nb" : "n.search_text_en";
  // Every code has a vector per language; the nearest of the two counts.
  // More vectors than codes are fetched, since two may belong to one code
  // and expired codes are left out afterwards.
  const candidates = limit * 4;

  const rows = await sequelize.transaction(async (transaction) => {
    // The index looks at this many candidates (default 40); it must be at
    // least as many as are asked for
    await sequelize.query(`SET LOCAL hnsw.ef_search = ${candidates}`, { transaction });
    // With vectors from more than one model in the table, the index finds
    // the nearest of all models and the model filter then drops some. From
    // pgvector 0.8 the index can keep scanning until enough rows pass the
    // filter; the outer query sorts them by distance again.
    if (await hasIterativeScan()) {
      await sequelize.query("SET LOCAL hnsw.iterative_scan = relaxed_order", { transaction });
    }
    return sequelize.query<{
      code: string;
      description_nb: string | null;
      description_en: string | null;
      context: string | null;
      distance: number;
    }>(
      `WITH nearest AS (
         SELECT text_hash, embedding <=> CAST(:vector AS vector) AS distance
           FROM text_embeddings
          WHERE model = :model
          ORDER BY embedding <=> CAST(:vector AS vector)
          LIMIT :candidates
       )
       SELECT n.code, n.description_nb, n.description_en, ${contextColumn} AS context,
              min(e.distance) AS distance
         FROM nearest e
         JOIN tariff_nodes n
           ON n.node_type = 'commodity'
          AND (n.embedding_hash_nb = e.text_hash OR n.embedding_hash_en = e.text_hash)
         JOIN commodities c ON c.code = n.code
        WHERE c.valid_to IS NULL OR c.valid_to >= :today
        GROUP BY n.code, n.description_nb, n.description_en, ${contextColumn}
        ORDER BY distance, n.code
        LIMIT :limit`,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: { vector, model: embedder.model, candidates, today: today(), limit },
      },
    );
  });

  return rows.map((r) => ({
    code: r.code,
    descriptionNb: r.description_nb,
    descriptionEn: r.description_en,
    context: r.context,
    rank: 1 - Number(r.distance),
  }));
}

// Reciprocal rank fusion: a code scores weight / (k + place) in each list it
// is in, and the scores add up. Codes found by several methods rise; a code
// only one method finds still gets in. Places count, not the methods' own
// scores, which are not comparable.
export interface RankedList {
  hits: SearchHit[];
  weight: number;
}

export function fuseRankings(lists: RankedList[], limit: number, k = RRF_K): SearchHit[] {
  const fused = new Map<string, SearchHit>();
  for (const { hits, weight } of lists) {
    hits.forEach((hit, index) => {
      const score = weight / (k + index + 1);
      const seen = fused.get(hit.code);
      if (seen) seen.rank += score;
      else fused.set(hit.code, { ...hit, rank: score });
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.rank - a.rank || a.code.localeCompare(b.code))
    .slice(0, limit);
}

// Text search: every word must match; if no code has them all, codes with
// some of them ("any")
async function searchText(
  query: string,
  language: SearchLanguage,
  limit: number,
  contextLanguage: SearchLanguage = language,
): Promise<{ matched: "all" | "any"; hits: SearchHit[] }> {
  const words = searchWords(query);
  if (words.length === 0) return { matched: "all", hits: [] };
  const all = await searchByText(words, "&", language, limit, contextLanguage);
  if (all.length > 0 || words.length === 1) return { matched: "all", hits: all };
  return { matched: "any", hits: await searchByText(words, "|", language, limit, contextLanguage) };
}

// A query of digits (dots and spaces allowed, e.g. "6109.10") searches codes
// in every mode. Otherwise mode "text" searches the texts, "semantic" by
// meaning, "hybrid" both with the results merged, and "expanded" both for the
// query as written and as rewritten into the tariff's wording.
// "6109", "6109.10", "6109 10 00": a query of digits searches codes. Code
// search needs no model, whatever the mode.
export function isCodeQuery(query: string): boolean {
  return /^[\d.\s]+$/.test(query.trim());
}

export async function searchCommodities(
  query: string,
  language: SearchLanguage,
  limit: number,
  mode: SearchMode = "text",
): Promise<SearchResult> {
  const trimmed = query.trim();
  if (isCodeQuery(trimmed)) {
    const digits = trimmed.replace(/[.\s]/g, "");
    return { query: trimmed, matched: "code", hits: await searchByCode(digits, language, limit) };
  }

  if (mode === "semantic") {
    return {
      query: trimmed,
      matched: "semantic",
      hits: await searchBySimilarity(trimmed, language, limit),
    };
  }
  if (mode === "hybrid") {
    const [text, semantic] = await Promise.all([
      searchText(trimmed, language, HYBRID_CANDIDATES),
      searchBySimilarity(trimmed, language, HYBRID_CANDIDATES),
    ]);
    return {
      query: trimmed,
      matched: "hybrid",
      hits: fuseRankings(
        [
          // A text search that matched only some of the words still counts
          // fully: measured, giving it less weight lost more right codes
          // (tea bags, bookshelf, tablet) than it saved
          { hits: text.hits, weight: 1 },
          { hits: semantic, weight: 1 },
        ],
        limit,
      ),
    };
  }
  if (mode === "expanded") {
    const rewritten = await rewriteQuery(trimmed);
    const other: SearchLanguage = language === "nb" ? "en" : "nb";
    const [original, inLanguage, inOther, semantic, semanticNb, semanticEn] = await Promise.all([
      searchText(trimmed, language, HYBRID_CANDIDATES),
      searchText(rewritten[language], language, HYBRID_CANDIDATES),
      // The other language's tariff text, with the context still in the
      // asked language
      searchText(rewritten[other], other, HYBRID_CANDIDATES, language),
      searchBySimilarity(trimmed, language, HYBRID_CANDIDATES),
      searchBySimilarity(rewritten.nb, language, HYBRID_CANDIDATES),
      searchBySimilarity(rewritten.en, language, HYBRID_CANDIDATES),
    ]);
    return {
      query: trimmed,
      matched: "expanded",
      rewritten,
      hits: fuseRankings(
        [
          { hits: original.hits, weight: 1 },
          { hits: inLanguage.hits, weight: 1 },
          { hits: inOther.hits, weight: 1 },
          { hits: semantic, weight: 1 },
          { hits: semanticNb, weight: 1 },
          { hits: semanticEn, weight: 1 },
        ],
        limit,
      ),
    };
  }

  const text = await searchText(trimmed, language, limit);
  return { query: trimmed, ...text };
}

export interface CommodityReference {
  code: string;
  expression: string | null;
  definitionNbHtml: string | null;
  definitionEnHtml: string | null;
  // The tree node the reference is attached to (the code or a level above)
  attachedTo: string | null;
}

export interface CommodityDetails {
  code: string;
  hsCode: string | null;
  descriptionNb: string | null;
  descriptionEn: string | null;
  path: {
    code: string | null;
    hsCode: string | null;
    nodeType: string;
    descriptionNb: string | null;
    descriptionEn: string | null;
  }[];
  unit: string | null;
  unitDescription: string | null;
  secondaryUnit: string | null;
  validFrom: string;
  validTo: string | null;
  classifications: { code: string; description: string | null }[];
  references: CommodityReference[];
}

export async function getCommodity(code: string): Promise<CommodityDetails | null> {
  const [row] = await sequelize.query<{
    code: string;
    node_id: number | null;
    hs_code: string | null;
    description_nb: string | null;
    description_en: string | null;
    unit: string | null;
    unit_description: string | null;
    secondary_unit: string | null;
    valid_from: string;
    valid_to: string | null;
  }>(
    `SELECT c.code, c.node_id, n.hs_code, n.description_nb, n.description_en, c.unit,
            c.unit_description, c.secondary_unit, c.valid_from, c.valid_to
       FROM commodities c
       LEFT JOIN tariff_nodes n ON n.id = c.node_id
      WHERE c.code = :code`,
    { type: QueryTypes.SELECT, replacements: { code } },
  );
  if (!row) return null;

  // The code's node and every node above it, top first
  const nodes = row.node_id
    ? await sequelize.query<{
        id: number;
        code: string | null;
        hs_code: string | null;
        node_type: string;
        description_nb: string | null;
        description_en: string | null;
      }>(
        `WITH RECURSIVE up AS (
           SELECT id, parent_id, code, hs_code, node_type, description_nb, description_en, depth
             FROM tariff_nodes WHERE id = :id
           UNION ALL
           SELECT n.id, n.parent_id, n.code, n.hs_code, n.node_type, n.description_nb, n.description_en, n.depth
             FROM tariff_nodes n JOIN up ON n.id = up.parent_id
         )
         SELECT id, code, hs_code, node_type, description_nb, description_en FROM up ORDER BY depth`,
        { type: QueryTypes.SELECT, replacements: { id: row.node_id } },
      )
    : [];

  const nodeIds = nodes.map((n) => n.id);
  const references = nodeIds.length
    ? await sequelize.query<{
        code: string;
        expression: string | null;
        definition_nb_html: string | null;
        definition_en_html: string | null;
        attached_to: string | null;
      }>(
        `SELECT r.code, r.expression, r.definition_nb_html, r.definition_en_html,
                n.code AS attached_to
           FROM tariff_node_references nr
           JOIN tariff_references r ON r.code = nr.reference_code
           JOIN tariff_nodes n ON n.id = nr.node_id
          WHERE nr.node_id IN (:ids)
          ORDER BY n.depth, r.code`,
        { type: QueryTypes.SELECT, replacements: { ids: nodeIds } },
      )
    : [];

  const classifications = await sequelize.query<{ code: string; description: string | null }>(
    `SELECT code, description FROM commodity_classifications
      WHERE commodity_code = :code AND (valid_to IS NULL OR valid_to >= :today)
      ORDER BY code`,
    { type: QueryTypes.SELECT, replacements: { code, today: today() } },
  );

  return {
    code: row.code,
    hsCode: row.hs_code,
    descriptionNb: row.description_nb,
    descriptionEn: row.description_en,
    path: nodes.slice(0, -1).map((n) => ({
      code: n.code,
      hsCode: n.hs_code,
      nodeType: n.node_type,
      descriptionNb: n.description_nb,
      descriptionEn: n.description_en,
    })),
    unit: row.unit,
    unitDescription: row.unit_description,
    secondaryUnit: row.secondary_unit,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    classifications,
    references: references.map((r) => ({
      code: r.code,
      expression: r.expression,
      definitionNbHtml: r.definition_nb_html,
      definitionEnHtml: r.definition_en_html,
      attachedTo: r.attached_to,
    })),
  };
}
