import { Router } from "express";

import { authMiddleware } from "../middleware/auth.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.js";
import {
  forgotPassword,
  login,
  me,
  postResetPassword,
  postVerifySiret,
  register,
} from "../controllers/auth.controller.js";

const router = Router();
const loginRateLimit = createRateLimitMiddleware({
  keyPrefix: "auth-login",
  max: 10,
  message: "Trop de tentatives de connexion. Merci de patienter quelques minutes.",
  code: "login_rate_limited",
});
const registerRateLimit = createRateLimitMiddleware({
  keyPrefix: "auth-register",
  max: 8,
  message: "Trop de creations de compte depuis cette adresse IP. Merci de reessayer plus tard.",
  code: "register_rate_limited",
});
const passwordResetRateLimit = createRateLimitMiddleware({
  keyPrefix: "auth-password-reset",
  max: 6,
  message:
    "Trop de demandes liees au mot de passe depuis cette adresse IP. Merci de reessayer plus tard.",
  code: "password_reset_rate_limited",
});
const siretVerificationRateLimit = createRateLimitMiddleware({
  keyPrefix: "auth-siret-verify",
  max: 12,
  message:
    "Trop de verifications SIRET depuis cette adresse IP. Merci de reessayer dans quelques minutes.",
  code: "siret_verification_rate_limited",
});

router.post("/register", registerRateLimit, register);
router.post("/login", loginRateLimit, login);
router.post("/forgot-password", passwordResetRateLimit, forgotPassword);
router.post("/reset-password", passwordResetRateLimit, postResetPassword);
router.post("/verify-siret", siretVerificationRateLimit, postVerifySiret);
router.get("/me", authMiddleware, me);

export default router;
