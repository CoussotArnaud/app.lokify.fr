import { Router } from "express";

import {
  getStorefront,
  getProviderStorefrontSettings,
  postStorefrontRequest,
  putProviderStorefrontSettings,
} from "../controllers/storefront.controller.js";

const router = Router();

router.get("/settings", getProviderStorefrontSettings);
router.put("/settings", putProviderStorefrontSettings);
router.get("/", getStorefront);
router.post("/requests", postStorefrontRequest);

export default router;
