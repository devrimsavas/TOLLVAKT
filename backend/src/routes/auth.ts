import express from "express";
import { register, login, me } from "../controllers/authController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import {
  loginPerAccountLimit,
  loginPerAddressLimit,
  registerLimit,
} from "../middlewares/rateLimits.js";

const router = express.Router();

router.post("/register", registerLimit, register);
router.post("/login", loginPerAddressLimit, loginPerAccountLimit, login);
router.get("/me", requireAuth, me);

export default router;
