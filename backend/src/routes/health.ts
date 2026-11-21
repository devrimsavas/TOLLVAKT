import express from "express";
import type { Request, Response } from "express";
import { sequelize } from "../config/database.js";

const router = express.Router();

// For Docker and uptime checks: 200 when the API can reach the database,
// 503 when it cannot.
router.get("/", async (req: Request, res: Response) => {
  // #swagger.tags = ["General"]
  // #swagger.summary = "API and database status"
  try {
    await sequelize.query("SELECT 1");
    res.json({ status: "ok", database: "ok" });
  } catch (error) {
    req.log.error({ err: error }, "Health check: database unreachable");
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});

export default router;
