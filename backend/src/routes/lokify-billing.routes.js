import { Router } from "express";

import {
  getLokifyBilling,
  getLokifyCheckout,
  postCancelLokifyRenewal,
  postCancelLokifyCheckout,
  postCompleteSimulationCheckout,
  postFinalizeLokifyCheckout,
  postLokifySubscriptionContactRequest,
  postLokifyPlanChangeRequest,
  postLokifyCheckoutSession,
} from "../controllers/lokify-billing.controller.js";

const router = Router();

router.get("/overview", getLokifyBilling);
router.post("/plan-change-request", postLokifyPlanChangeRequest);
router.post("/contact-request", postLokifySubscriptionContactRequest);
router.post("/checkout-session", postLokifyCheckoutSession);
router.get("/checkout-sessions/:sessionId", getLokifyCheckout);
router.post("/checkout-sessions/:sessionId/finalize", postFinalizeLokifyCheckout);
router.post(
  "/checkout-sessions/:sessionId/complete-simulation",
  postCompleteSimulationCheckout
);
router.post("/checkout-sessions/:sessionId/cancel", postCancelLokifyCheckout);
router.post("/subscription/cancel-renewal", postCancelLokifyRenewal);

export default router;
