import type { Request, Response } from "express";
import { ClassificationUnavailableError, classify as classifyProduct } from "../services/classifier.js";
import { saveClassification } from "../services/classificationStore.js";
import { SemanticSearchUnavailableError } from "../services/commodityService.js";
import { EmbeddingError } from "../services/embeddings/embedder.js";
import { LlmError } from "../services/llm/llm.js";
import { QueryRewriteUnavailableError } from "../services/queryRewriter.js";
import { release } from "../services/usageService.js";
import { reserveFor } from "./usageController.js";

const MAX_DESCRIPTION_LENGTH = 500;

// POST /api/classify
export const classify = async (req: Request, res: Response) => {
  // #swagger.tags = ["Classification"]
  /* #swagger.summary = "Suggest commodity codes for a product description"
     #swagger.description = "Finds candidate codes with expanded search, then a language model picks up to 3 with reasons, confidence (high/medium/low) and questions whose answers would decide between them. Suggestions only: not a binding classification. Open to guests and members, within today's quota (see GET /api/usage); 429 when it is used up. A member's classification is saved (id; see /api/classifications), a guest's is not (id is null)."
     #swagger.security = [{}, { "bearerAuth": [] }]
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

  let reserved: Awaited<ReturnType<typeof reserveFor>>;
  try {
    reserved = await reserveFor(req, res, "classify");
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not check the quota" });
    return;
  }
  if (!reserved) return;
  const { caller, reservation } = reserved;

  let result;
  try {
    result = await classifyProduct(description, lang);
  } catch (error) {
    // The caller does not pay for a call that failed on our side
    await release(reservation.eventId).catch((releaseError: unknown) =>
      req.log.error({ err: releaseError }, "Could not give back the quota place"),
    );
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
    return;
  }

  // The member gets the answer even if saving it fails; it is logged
  let saved: { id: string; createdAt: string } | null = null;
  if (caller.kind === "user") {
    try {
      saved = await saveClassification(caller.id, lang, result);
    } catch (error) {
      req.log.error({ err: error }, "Could not save the classification");
    }
  }

  res.json({
    ...result,
    id: saved?.id ?? null,
    createdAt: saved?.createdAt ?? new Date().toISOString(),
    usage: reservation.usage,
  });
};
