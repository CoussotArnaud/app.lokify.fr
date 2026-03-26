import asyncHandler from "../utils/async-handler.js";
import {
  cancelLokifyRenewalAtPeriodEnd,
  cancelLokifyCheckoutSession,
  completeSimulationCheckoutSession,
  createLokifyCheckoutSession,
  finalizeLokifyCheckoutSession,
  getLokifyBillingOverview,
  getLokifyCheckoutSession,
  handleStripeWebhook,
} from "../services/lokify-subscription.service.js";

export const getLokifyBilling = asyncHandler(async (req, res) => {
  const overview = await getLokifyBillingOverview(req.user.id);
  res.json(overview);
});

export const postLokifyCheckoutSession = asyncHandler(async (req, res) => {
  const session = await createLokifyCheckoutSession(req.user, req.body.planId);
  res.status(201).json(session);
});

export const getLokifyCheckout = asyncHandler(async (req, res) => {
  const checkoutSession = await getLokifyCheckoutSession(req.user.id, req.params.sessionId);
  res.json({ checkoutSession });
});

export const postFinalizeLokifyCheckout = asyncHandler(async (req, res) => {
  const result = await finalizeLokifyCheckoutSession(req.user.id, req.params.sessionId);
  res.json(result);
});

export const postCompleteSimulationCheckout = asyncHandler(async (req, res) => {
  const result = await completeSimulationCheckoutSession(req.user.id, req.params.sessionId);
  res.json(result);
});

export const postCancelLokifyCheckout = asyncHandler(async (req, res) => {
  await cancelLokifyCheckoutSession(req.user.id, req.params.sessionId);
  res.status(204).send();
});

export const postCancelLokifyRenewal = asyncHandler(async (req, res) => {
  const result = await cancelLokifyRenewalAtPeriodEnd(req.user.id);
  res.json(result);
});

export const postLokifyStripeWebhook = asyncHandler(async (req, res) => {
  const result = await handleStripeWebhook(req.body, req.headers["stripe-signature"]);
  res.json(result);
});
