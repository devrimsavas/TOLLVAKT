import express from "express";
import { usage } from "../controllers/usageController.js";
import { optionalAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

router.get("/", optionalAuth, usage);

export default router;
