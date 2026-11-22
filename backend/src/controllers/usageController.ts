import type { Request, Response } from "express";
import { callerOf, getUsage, QuotaExceededError, reserve, type Caller, type Reservation, type UsageKind } from "../services/usageService.js";

// The 429 answer when a quota is used up: whose limit it was, and when the
// count starts again
export function sendQuotaExceeded(res: Response, error: QuotaExceededError): void {
  const retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(error.resetsAt) - Date.now()) / 1000));
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({
    error: error.message,
    scope: error.scope,
    limit: error.limit,
    resetsAt: error.resetsAt,
    retryAfterSeconds,
  });
}

// The caller and a place in today's quota for a model-backed call. When the
// request has been answered already (the token's user is gone, the quota is
// used up), returns null.
export async function reserveFor(
  req: Request,
  res: Response,
  kind: UsageKind,
): Promise<{ caller: Caller; reservation: Reservation } | null> {
  const caller = await callerOf(req.auth, req.ip);
  if (!caller) {
    res.status(404).json({ error: "User not found" });
    return null;
  }
  try {
    return { caller, reservation: await reserve(caller, kind) };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      sendQuotaExceeded(res, error);
      return null;
    }
    throw error;
  }
}

// GET /api/usage
export const usage = async (req: Request, res: Response) => {
  // #swagger.tags = ["Usage"]
  /* #swagger.summary = "Today's quota for the caller"
     #swagger.description = "How many classifications and model-backed searches (semantic, hybrid, expanded) the caller has made today and may still make. Without a token, the guest quota of the caller's address. limit and remaining are null for admins, who have no limit of their own. The day starts at midnight in Norway (resetsAt)."
     #swagger.security = [{}, { "bearerAuth": [] }] */
  try {
    const caller = await callerOf(req.auth, req.ip);
    if (!caller) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(await getUsage(caller));
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not load the usage" });
  }
};
