import express from "express";
import { details, search } from "../controllers/commodityController.js";

const router = express.Router();

// /search comes first, so "search" is not read as a code
router.get("/search", search);
router.get("/:code", details);

export default router;
