import { Router } from "express";

import {
  getPublicStorefrontHeroImage,
  getPublicStorefront,
  postFinalizePublicStorefrontCheckout,
  postPublicStorefrontCheckout,
  postPublicStorefrontRequest,
} from "../controllers/storefront.controller.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.js";

const router = Router();
const storefrontRequestRateLimit = createRateLimitMiddleware({
  keyPrefix: "public-storefront-requests",
  max: 20,
  message:
    "Trop de demandes boutique ont ete envoyees depuis cette adresse IP. Merci de reessayer plus tard.",
  code: "public_storefront_request_rate_limited",
});

router.get("/hero-images", getPublicStorefrontHeroImage);
router.get("/:slug", getPublicStorefront);
router.post("/:slug/requests", storefrontRequestRateLimit, postPublicStorefrontRequest);
router.post("/:slug/checkout", storefrontRequestRateLimit, postPublicStorefrontCheckout);
router.post(
  "/:slug/checkout-sessions/:sessionId/finalize",
  storefrontRequestRateLimit,
  postFinalizePublicStorefrontCheckout
);

export default router;
