import asyncHandler from "../utils/async-handler.js";
import {
  cancelStorefrontHeroImageUpload,
  createPublicStorefrontCheckoutSession,
  createStorefrontCheckoutSession,
  finalizeStorefrontHeroImageUpload,
  finalizePublicStorefrontCheckoutSession,
  finalizeStorefrontCheckoutSession,
  getPublicStorefrontPreview,
  getStorefrontSettings,
  getStorefrontPreview,
  startStorefrontHeroImageUpload,
  submitPublicStorefrontRequest,
  submitStorefrontRequest,
  uploadStorefrontHeroImageChunk,
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

export const postProviderStorefrontHeroImageUpload = asyncHandler(async (req, res) => {
  const upload = await startStorefrontHeroImageUpload(req.user.id, req.body);
  res.status(201).json({ upload });
});

export const postProviderStorefrontHeroImageUploadPart = asyncHandler(async (req, res) => {
  const part = await uploadStorefrontHeroImageChunk(req.user.id, req.params.uploadId, req.body);
  res.status(201).json({ part });
});

export const postProviderStorefrontHeroImageUploadComplete = asyncHandler(async (req, res) => {
  const upload = await finalizeStorefrontHeroImageUpload(req.user.id, req.params.uploadId, req.body);
  res.status(201).json({ upload });
});

export const deleteProviderStorefrontHeroImageUpload = asyncHandler(async (req, res) => {
  await cancelStorefrontHeroImageUpload(req.user.id, req.body);
  res.status(204).end();
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
