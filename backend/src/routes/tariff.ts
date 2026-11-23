import express from "express";
import { children, sections } from "../controllers/tariffTreeController.js";

const router = express.Router();

router.get("/tree", sections);
router.get("/tree/:nodeId/children", children);

export default router;
