import type { Request, Response } from "express";
import { dailyUsage, listUsers, OwnAccountError, updateUser, type UserChanges } from "../services/adminService.js";
import { limitSettings } from "../services/usageService.js";

const MAX_DAILY_LIMIT = 10000;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

// GET /api/admin/users
export const users = async (req: Request, res: Response) => {
  // #swagger.tags = ["Admin"]
  /* #swagger.summary = "All accounts with their limits and today's use"
     #swagger.security = [{ "bearerAuth": [] }] */
  try {
    res.json(await listUsers());
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not load the users" });
  }
};

// PATCH /api/admin/users/:userId
export const changeUser = async (req: Request, res: Response) => {
  // #swagger.tags = ["Admin"]
  /* #swagger.summary = "Change a member's daily limit or close / reopen the account"
     #swagger.description = "dailyLimit: a whole number from 0, or null for the default (USER_DAILY_LIMIT). isActive: false closes the account (no login, tokens refused), true reopens it. An admin cannot close their own account."
     #swagger.security = [{ "bearerAuth": [] }]
     #swagger.requestBody = {
       required: true,
       content: { "application/json": { example: { dailyLimit: 25, isActive: true } } }
     } */
  const body = (req.body ?? {}) as Record<string, unknown>;
  const changes: UserChanges = {};

  if ("dailyLimit" in body) {
    const value = body.dailyLimit;
    if (value !== null && !(Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_DAILY_LIMIT)) {
      res.status(400).json({ error: `dailyLimit must be null or a whole number from 0 to ${MAX_DAILY_LIMIT}` });
      return;
    }
    changes.dailyLimit = value as number | null;
  }
  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") {
      res.status(400).json({ error: "isActive must be true or false" });
      return;
    }
    changes.isActive = body.isActive;
  }
  if (Object.keys(changes).length === 0) {
    res.status(400).json({ error: "Give dailyLimit, isActive or both" });
    return;
  }

  try {
    const user = await updateUser(String(req.params.userId), changes, req.auth!.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (error) {
    if (error instanceof OwnAccountError) {
      res.status(400).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not change the user" });
  }
};

// GET /api/admin/usage?days=30
export const usage = async (req: Request, res: Response) => {
  // #swagger.tags = ["Admin"]
  /* #swagger.summary = "Use of the models per day, and today's total against the global limit"
     #swagger.description = "Classifications and model-backed searches per day in Norway, with the number of different members and guests. Days without use are included."
     #swagger.security = [{ "bearerAuth": [] }]
     #swagger.parameters["days"] = { in: "query", type: "integer", example: 30 } */
  const days = req.query.days === undefined ? DEFAULT_DAYS : Number(req.query.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    res.status(400).json({ error: `days must be a whole number from 1 to ${MAX_DAYS}` });
    return;
  }

  try {
    const perDay = await dailyUsage(days);
    const today = perDay[perDay.length - 1]!;
    const limits = limitSettings();
    const usedToday = today.classify + today.search;
    res.json({
      limits,
      today: {
        used: usedToday,
        globalLimit: limits.global,
        remaining: Math.max(0, limits.global - usedToday),
      },
      days: perDay,
    });
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not load the usage" });
  }
};
