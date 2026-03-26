import { Router } from "express";

import {
  deleteProviderController,
  getAdminOverviewController,
  getProviderController,
  getProvidersController,
  getSuperAdminStripeSettingsController,
  postProviderPasswordResetController,
  postProviderController,
  putProviderController,
  putSuperAdminStripeSettingsController,
} from "../controllers/admin.controller.js";

const router = Router();

router.get("/overview", getAdminOverviewController);
router.get("/providers", getProvidersController);
router.get("/providers/:providerId", getProviderController);
router.post("/providers", postProviderController);
router.put("/providers/:providerId", putProviderController);
router.post("/providers/:providerId/password-reset", postProviderPasswordResetController);
router.delete("/providers/:providerId", deleteProviderController);
router.get("/stripe/settings", getSuperAdminStripeSettingsController);
router.put("/stripe/settings", putSuperAdminStripeSettingsController);

export default router;
