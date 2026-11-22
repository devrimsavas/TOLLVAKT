import type { Request, Response } from "express";
import {
  getCommodity,
  isCodeQuery,
  searchCommodities,
  SemanticSearchUnavailableError,
  type SearchLanguage,
  type SearchMode,
} from "../services/commodityService.js";
import { EmbeddingError } from "../services/embeddings/embedder.js";
import { LlmError } from "../services/llm/llm.js";
import { QueryRewriteUnavailableError } from "../services/queryRewriter.js";
import { release, type Reservation } from "../services/usageService.js";
import { reserveFor } from "./usageController.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_QUERY_LENGTH = 200;

// GET /api/commodities/search?q=...&lang=nb|en&limit=20&mode=text|semantic|hybrid|expanded
export const search = async (req: Request, res: Response) => {
  // #swagger.tags = ["Commodities"]
  /* #swagger.summary = "Search commodity codes by text or code"
     #swagger.description = "Full-text search in the Norwegian (nb, default) or English (en) tariff texts, including the texts above each code. Every word matches as a prefix; if no code matches all words, codes matching some of them are returned (matched: any). A query of digits searches codes (e.g. 6109 or 6109.10). mode=semantic searches by meaning with the embedding model instead (matched: semantic; rank is the similarity, 0 to 1). mode=hybrid runs both and merges the results by reciprocal rank fusion (matched: hybrid). mode=expanded also has a language model rewrite the query into the tariff's wording in Norwegian and English, and searches with those too (matched: expanded; the rewrite is in rewritten). Text and code search are free; semantic, hybrid and expanded search use a model and count towards today's quota (see GET /api/usage), with 429 when it is used up."
     #swagger.security = [{}, { "bearerAuth": [] }]
     #swagger.parameters["q"] = { in: "query", required: true, type: "string", example: "t-skjorte bomull" }
     #swagger.parameters["lang"] = { in: "query", type: "string", enum: ["nb", "en"] }
     #swagger.parameters["limit"] = { in: "query", type: "integer", example: 20 }
     #swagger.parameters["mode"] = { in: "query", type: "string", enum: ["text", "semantic", "hybrid", "expanded"] } */
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length > MAX_QUERY_LENGTH) {
    res.status(400).json({ error: `q is required (max ${MAX_QUERY_LENGTH} characters)` });
    return;
  }
  const lang = req.query.lang ?? "nb";
  if (lang !== "nb" && lang !== "en") {
    res.status(400).json({ error: "lang must be nb or en" });
    return;
  }
  const limit = req.query.limit === undefined ? DEFAULT_LIMIT : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    res.status(400).json({ error: `limit must be a whole number from 1 to ${MAX_LIMIT}` });
    return;
  }

  const mode = req.query.mode ?? "text";
  if (mode !== "text" && mode !== "semantic" && mode !== "hybrid" && mode !== "expanded") {
    res.status(400).json({ error: "mode must be text, semantic, hybrid or expanded" });
    return;
  }

  // Modes that call a model count towards the quota; a code search needs none
  let reservation: Reservation | undefined;
  if (mode !== "text" && !isCodeQuery(q)) {
    try {
      const reserved = await reserveFor(req, res, "search");
      if (!reserved) return;
      reservation = reserved.reservation;
    } catch (error) {
      req.log.error({ err: error }, "Request failed");
      res.status(500).json({ error: "Could not check the quota" });
      return;
    }
  }

  try {
    res.json(await searchCommodities(q, lang as SearchLanguage, limit, mode as SearchMode));
  } catch (error) {
    if (reservation) {
      // The caller does not pay for a search that failed on our side
      await release(reservation.eventId).catch((releaseError: unknown) =>
        req.log.error({ err: releaseError }, "Could not give back the quota place"),
      );
    }
    if (
      error instanceof SemanticSearchUnavailableError ||
      error instanceof EmbeddingError ||
      error instanceof QueryRewriteUnavailableError ||
      error instanceof LlmError
    ) {
      req.log.warn({ err: error }, "Search mode unavailable");
      res.status(503).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Search failed" });
  }
};

// GET /api/commodities/:code
export const details = async (req: Request, res: Response) => {
  // #swagger.tags = ["Commodities"]
  /* #swagger.summary = "One commodity code with its path in the tariff, units and references"
     #swagger.parameters["code"] = { in: "path", required: true, type: "string", example: "61091000" } */
  const code = String(req.params.code ?? "").replace(/\./g, "");
  if (!/^\d{8}$/.test(code)) {
    res.status(400).json({ error: "code must be an 8-digit commodity code (dots are allowed)" });
    return;
  }

  try {
    const commodity = await getCommodity(code);
    if (!commodity) {
      res.status(404).json({ error: `Unknown commodity code ${code}` });
      return;
    }
    res.json(commodity);
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not load the commodity code" });
  }
};
