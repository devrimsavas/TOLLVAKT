import express from "express";
import { postFeedback } from "../controllers/feedbackController.js";
import { feedbackLimit } from "../middlewares/rateLimits.js";

const router = express.Router();

router.post("/", feedbackLimit, postFeedback);

export default router;
