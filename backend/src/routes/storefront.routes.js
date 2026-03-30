import { Router } from "express";

import {
  getStorefront,
  getProviderStorefrontSettings,
  postFinalizeStorefrontCheckout,
  postStorefrontCheckout,
  postStorefrontRequest,
  putProviderStorefrontSettings,
} from "../controllers/storefront.controller.js";

const router = Router();

router.get("/settings", getProviderStorefrontSettings);
router.put("/settings", putProviderStorefrontSettings);
router.get("/", getStorefront);
router.post("/requests", postStorefrontRequest);
router.post("/checkout", postStorefrontCheckout);
router.post("/checkout-sessions/:sessionId/finalize", postFinalizeStorefrontCheckout);

export default router;
