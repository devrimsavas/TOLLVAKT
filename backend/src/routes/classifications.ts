import express from "express";
import { details, list, remove } from "../controllers/classificationsController.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

// A member's own saved classifications
router.use(requireAuth);
router.get("/", list);
router.get("/:id", details);
router.delete("/:id", remove);

export default router;
