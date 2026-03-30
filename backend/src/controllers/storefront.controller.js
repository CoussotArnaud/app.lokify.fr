import asyncHandler from "../utils/async-handler.js";
import {
  createPublicStorefrontCheckoutSession,
  createStorefrontCheckoutSession,
  finalizePublicStorefrontCheckoutSession,
  finalizeStorefrontCheckoutSession,
  getPublicStorefrontPreview,
  getStorefrontSettings,
  getStorefrontPreview,
  submitPublicStorefrontRequest,
  submitStorefrontRequest,
  updateStorefrontSettings,
} from "../services/storefront.service.js";

export const getStorefront = asyncHandler(async (req, res) => {
  const storefront = await getStorefrontPreview(req.user.id, req.query);
  res.json(storefront);
});

export const postStorefrontRequest = asyncHandler(async (req, res) => {
  const result = await submitStorefrontRequest(req.user.id, req.body);
  res.status(201).json(result);
});

export const postStorefrontCheckout = asyncHandler(async (req, res) => {
  const result = await createStorefrontCheckoutSession(req.user.id, req.body);
  res.status(201).json(result);
});

export const postFinalizeStorefrontCheckout = asyncHandler(async (req, res) => {
  const result = await finalizeStorefrontCheckoutSession(req.user.id, req.params.sessionId);
  res.json(result);
});

export const getProviderStorefrontSettings = asyncHandler(async (req, res) => {
  const storefrontSettings = await getStorefrontSettings(req.user.id);
  res.json({ storefrontSettings });
});

export const putProviderStorefrontSettings = asyncHandler(async (req, res) => {
  const storefrontSettings = await updateStorefrontSettings(req.user.id, req.body);
  res.json({ storefrontSettings });
});

export const getPublicStorefront = asyncHandler(async (req, res) => {
  const storefront = await getPublicStorefrontPreview(req.params.slug, req.query);
  res.json(storefront);
});

export const postPublicStorefrontRequest = asyncHandler(async (req, res) => {
  const result = await submitPublicStorefrontRequest(req.params.slug, req.body);
  res.status(201).json(result);
});

export const postPublicStorefrontCheckout = asyncHandler(async (req, res) => {
  const result = await createPublicStorefrontCheckoutSession(req.params.slug, req.body);
  res.status(201).json(result);
});

export const postFinalizePublicStorefrontCheckout = asyncHandler(async (req, res) => {
  const result = await finalizePublicStorefrontCheckoutSession(
    req.params.slug,
    req.params.sessionId
  );
  res.json(result);
});
