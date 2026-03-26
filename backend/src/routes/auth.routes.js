import { Router } from "express";

import { authMiddleware } from "../middleware/auth.js";
import {
  forgotPassword,
  login,
  me,
  postResetPassword,
  register,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", postResetPassword);
router.get("/me", authMiddleware, me);

export default router;
