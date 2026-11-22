import express from "express";
import { details, search } from "../controllers/commodityController.js";
import { optionalAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

// /search comes first, so "search" is not read as a code. Search is open to
// guests; a member's token gives the member's quota for the model-backed modes.
router.get("/search", optionalAuth, search);
router.get("/:code", details);

export default router;
