import { Router } from "express";

import { verifySiret } from "../controllers/company.controller.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.js";

const router = Router();
const verifySiretRateLimit = createRateLimitMiddleware({
  keyPrefix: "company-verify-siret",
  max: 20,
  message:
    "Trop de verifications SIRET ont ete lancees depuis cette adresse IP. Merci de reessayer plus tard.",
  code: "siret_rate_limited",
});

router.post("/verify-siret", verifySiretRateLimit, verifySiret);

export default router;
