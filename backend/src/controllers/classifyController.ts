import type { Request, Response } from "express";
import { ClassificationUnavailableError, classify as classifyProduct } from "../services/classifier.js";
import { SemanticSearchUnavailableError } from "../services/commodityService.js";
import { EmbeddingError } from "../services/embeddings/embedder.js";
import { LlmError } from "../services/llm/llm.js";
import { QueryRewriteUnavailableError } from "../services/queryRewriter.js";

const MAX_DESCRIPTION_LENGTH = 500;

// POST /api/classify
export const classify = async (req: Request, res: Response) => {
  // #swagger.tags = ["Classification"]
  /* #swagger.summary = "Suggest commodity codes for a product description"
     #swagger.description = "Finds candidate codes with expanded search, then a language model picks up to 3 with reasons, confidence (high/medium/low) and questions whose answers would decide between them. Suggestions only: not a binding classification."
     #swagger.requestBody = {
       required: true,
       content: { "application/json": { example: { description: "Strikket genser i ull til herre", lang: "nb" } } }
     } */
  const body = (req.body ?? {}) as { description?: unknown; lang?: unknown };
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
    res.status(400).json({ error: `description is required (max ${MAX_DESCRIPTION_LENGTH} characters)` });
    return;
  }
  const lang = body.lang ?? "nb";
  if (lang !== "nb" && lang !== "en") {
    res.status(400).json({ error: "lang must be nb or en" });
    return;
  }

  try {
    res.json(await classifyProduct(description, lang));
  } catch (error) {
    if (
      error instanceof ClassificationUnavailableError ||
      error instanceof QueryRewriteUnavailableError ||
      error instanceof SemanticSearchUnavailableError ||
      error instanceof EmbeddingError ||
      error instanceof LlmError
    ) {
      req.log.warn({ err: error }, "Classification unavailable");
      res.status(503).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Classification failed" });
  }
};
