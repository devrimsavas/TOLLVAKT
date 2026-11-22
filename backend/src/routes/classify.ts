import express from "express";
import { classify } from "../controllers/classifyController.js";
import { optionalAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

// Guests and members; the quota depends on which
router.post("/", optionalAuth, classify);

export default router;
