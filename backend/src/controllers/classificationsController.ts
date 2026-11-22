import type { Request, Response } from "express";
import { User } from "../models/User.js";
import {
  deleteClassification,
  getClassification,
  listClassifications,
} from "../services/classificationStore.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// The logged-in member's internal id; answers 404 when the account is gone
async function memberId(req: Request, res: Response): Promise<number | null> {
  const user = await User.findOne({ where: { publicId: req.auth!.userId }, attributes: ["id"] });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return null;
  }
  return user.id;
}

function wholeNumber(value: unknown, fallback: number): number {
  return value === undefined ? fallback : Number(value);
}

// GET /api/classifications
export const list = async (req: Request, res: Response) => {
  // #swagger.tags = ["Saved classifications"]
  /* #swagger.summary = "The member's saved classifications, newest first"
     #swagger.security = [{ "bearerAuth": [] }]
     #swagger.parameters["limit"] = { in: "query", type: "integer", example: 20 }
     #swagger.parameters["offset"] = { in: "query", type: "integer", example: 0 } */
  const limit = wholeNumber(req.query.limit, DEFAULT_LIMIT);
  const offset = wholeNumber(req.query.offset, 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    res.status(400).json({ error: `limit must be a whole number from 1 to ${MAX_LIMIT}` });
    return;
  }
  if (!Number.isInteger(offset) || offset < 0) {
    res.status(400).json({ error: "offset must be a whole number from 0" });
    return;
  }

  try {
    const id = await memberId(req, res);
    if (id === null) return;
    res.json(await listClassifications(id, limit, offset));
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not load the classifications" });
  }
};

// GET /api/classifications/:id
export const details = async (req: Request, res: Response) => {
  // #swagger.tags = ["Saved classifications"]
  /* #swagger.summary = "One saved classification, as it was answered"
     #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const id = await memberId(req, res);
    if (id === null) return;
    const saved = await getClassification(id, String(req.params.id));
    if (!saved) {
      res.status(404).json({ error: "Classification not found" });
      return;
    }
    res.json(saved);
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not load the classification" });
  }
};

// DELETE /api/classifications/:id
export const remove = async (req: Request, res: Response) => {
  // #swagger.tags = ["Saved classifications"]
  /* #swagger.summary = "Delete one saved classification"
     #swagger.security = [{ "bearerAuth": [] }] */
  try {
    const id = await memberId(req, res);
    if (id === null) return;
    if (!(await deleteClassification(id, String(req.params.id)))) {
      res.status(404).json({ error: "Classification not found" });
      return;
    }
    res.status(204).end();
  } catch (error) {
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not delete the classification" });
  }
};
