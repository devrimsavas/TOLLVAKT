import express from "express";
import { changeUser, usage, users } from "../controllers/adminController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

router.use(requireAuth, requireRole("admin"));
router.get("/users", users);
router.patch("/users/:userId", changeUser);
router.get("/usage", usage);

export default router;
