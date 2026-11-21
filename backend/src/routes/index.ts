import express from "express";
import type { Request, Response } from "express";

const router = express.Router();

router.get("/", (req: Request, res: Response) => {
  // #swagger.tags = ["General"]
  res.json({
    message: "Tollvakt API",
    docs: "/api/docs",
  });
});

export default router;
