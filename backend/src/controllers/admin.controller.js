import asyncHandler from "../utils/async-handler.js";
import {
  createProviderFromAdmin,
  deleteProviderFromAdmin,
  getAdminOverview,
  getProviderForAdmin,
  listProvidersForAdmin,
  requestProviderInvitationFromAdmin,
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
      : "Le lien de reinitialisation a ete genere et peut etre transmis au prestataire.";

  res.json({
    message,
    deliveryMode: resetRequest.deliveryMode,
    requestedAt: resetRequest.requestedAt,
    expiresAt: resetRequest.expiresAt,
  });
});

export const postProviderInvitationController = asyncHandler(async (req, res) => {
  const invitationRequest = await requestProviderInvitationFromAdmin(
    req.params.providerId,
    req.user.id
  );
  const message =
    invitationRequest.purpose === "activation"
      ? invitationRequest.deliveryMode === "smtp"
        ? "L'invitation d'activation a ete envoyee au prestataire."
        : "Le lien d'activation a ete genere et peut etre transmis au prestataire."
      : invitationRequest.deliveryMode === "smtp"
        ? "Un email de confirmation a ete envoye au prestataire."
        : "Le lien securise a ete genere et peut etre transmis au prestataire.";

  res.json({
    message,
    purpose: invitationRequest.purpose,
    deliveryMode: invitationRequest.deliveryMode,
    requestedAt: invitationRequest.requestedAt,
    expiresAt: invitationRequest.expiresAt,
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
