import express from "express";
import { classify } from "../controllers/classifyController.js";

const router = express.Router();

router.post("/", classify);

export default router;
