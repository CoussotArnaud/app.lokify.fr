import { Router } from "express";

import {
  deleteProviderStorefrontHeroImageUpload,
  getStorefront,
  getProviderStorefrontSettings,
  postProviderStorefrontHeroImageUpload,
  postProviderStorefrontHeroImageUploadComplete,
  postProviderStorefrontHeroImageUploadPart,
  postFinalizeStorefrontCheckout,
  postStorefrontCheckout,
  postStorefrontRequest,
  putProviderStorefrontSettings,
} from "../controllers/storefront.controller.js";

const router = Router();

router.get("/settings", getProviderStorefrontSettings);
router.put("/settings", putProviderStorefrontSettings);
router.post("/settings/hero-images/uploads", postProviderStorefrontHeroImageUpload);
router.post("/settings/hero-images/uploads/:uploadId/parts", postProviderStorefrontHeroImageUploadPart);
router.post(
  "/settings/hero-images/uploads/:uploadId/complete",
  postProviderStorefrontHeroImageUploadComplete
);
router.delete("/settings/hero-images/uploads", deleteProviderStorefrontHeroImageUpload);
router.get("/", getStorefront);
router.post("/requests", postStorefrontRequest);
router.post("/checkout", postStorefrontCheckout);
router.post("/checkout-sessions/:sessionId/finalize", postFinalizeStorefrontCheckout);

export default router;
