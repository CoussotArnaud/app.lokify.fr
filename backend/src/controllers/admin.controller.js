import asyncHandler from "../utils/async-handler.js";
import {
  createProviderFromAdmin,
  deleteProviderFromAdmin,
  getAdminOverview,
  getProviderForAdmin,
  listProvidersForAdmin,
  requestProviderPasswordResetFromAdmin,
  updateProviderFromAdmin,
} from "../services/admin.service.js";
import {
  getSuperAdminStripeSettings,
  updateSuperAdminStripeSettings,
} from "../services/platform-stripe-settings.service.js";

export const getAdminOverviewController = asyncHandler(async (_req, res) => {
  const overview = await getAdminOverview();
  res.json(overview);
});

export const getProvidersController = asyncHandler(async (_req, res) => {
  const providers = await listProvidersForAdmin();
  res.json({ providers });
});

export const getProviderController = asyncHandler(async (req, res) => {
  const provider = await getProviderForAdmin(req.params.providerId);
  res.json({ provider });
});

export const postProviderController = asyncHandler(async (req, res) => {
  const provider = await createProviderFromAdmin(req.body);
  res.status(201).json({ provider });
});

export const putProviderController = asyncHandler(async (req, res) => {
  const provider = await updateProviderFromAdmin(req.params.providerId, req.body);
  res.json({ provider });
});

export const postProviderPasswordResetController = asyncHandler(async (req, res) => {
  const resetRequest = await requestProviderPasswordResetFromAdmin(
    req.params.providerId,
    req.user.id
  );
  const message =
    resetRequest.deliveryMode === "smtp"
      ? "Un email de reinitialisation a ete envoye au prestataire."
      : "Le lien de reinitialisation a ete genere en mode demo local.";

  res.json({
    message,
    deliveryMode: resetRequest.deliveryMode,
    requestedAt: resetRequest.requestedAt,
    expiresAt: resetRequest.expiresAt,
  });
});

export const deleteProviderController = asyncHandler(async (req, res) => {
  await deleteProviderFromAdmin(req.params.providerId);
  res.status(204).send();
});

export const getSuperAdminStripeSettingsController = asyncHandler(async (_req, res) => {
  const settings = await getSuperAdminStripeSettings();
  res.json(settings);
});

export const putSuperAdminStripeSettingsController = asyncHandler(async (req, res) => {
  const settings = await updateSuperAdminStripeSettings(req.body, req.user.id);
  res.json(settings);
});
