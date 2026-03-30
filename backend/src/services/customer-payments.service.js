import env from "../config/env.js";
import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";
import { ensureUserSettingsRecords } from "./account-profile.service.js";
import { getResolvedSuperAdminStripeConfiguration } from "./platform-stripe-settings.service.js";
import {
  createConnectAccountOnboardingLink,
  createConnectExpressAccount,
  retrieveConnectAccount,
} from "./stripe-connect.service.js";

const parseJsonArray = (value) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const normalizeOptionalText = (value) => {
  const normalizedValue = String(value || "").trim();
  return normalizedValue || null;
};

const normalizeCountry = (value) => {
  const normalizedValue = String(value || "").trim().toUpperCase();
  return normalizedValue.length === 2 ? normalizedValue : "FR";
};

const buildSettingsReturnUrl = (flag) => {
  const url = new URL("/parametres", env.clientUrl);
  url.searchParams.set("section", "payments");
  url.searchParams.set("stripe", flag);
  return url.toString();
};

const resolveStripeAccountStatus = ({
  accountId,
  detailsSubmitted,
  chargesEnabled,
  payoutsEnabled,
  requirementsDue,
  disabledReason,
} = {}) => {
  if (!accountId) {
    return "not_connected";
  }

  if (chargesEnabled && payoutsEnabled) {
    return "ready";
  }

  if (disabledReason || requirementsDue.length) {
    return "action_required";
  }

  if (detailsSubmitted) {
    return "pending";
  }

  return "pending";
};

const buildStripeStatusLabel = (status) => {
  switch (status) {
    case "ready":
      return "Compte Stripe connecte";
    case "action_required":
      return "Action requise";
    case "pending":
      return "Configuration Stripe incomplete";
    case "not_connected":
    default:
      return "Compte Stripe non connecte";
  }
};

const buildRequirementsSummary = (requirementsDue) => {
  if (!requirementsDue.length) {
    return "";
  }

  return `Informations manquantes: ${requirementsDue.length}`;
};

const serializeCustomerPaymentSettings = (row, { platformReady = true, syncError = "" } = {}) => {
  const stripeRequirementsDue = parseJsonArray(row?.customer_stripe_requirements_due_json);
  const stripeConnected = Boolean(row?.customer_stripe_account_id);
  const stripeStatus = resolveStripeAccountStatus({
    accountId: row?.customer_stripe_account_id,
    detailsSubmitted: Boolean(row?.customer_stripe_details_submitted),
    chargesEnabled: Boolean(row?.customer_stripe_charges_enabled),
    payoutsEnabled: Boolean(row?.customer_stripe_payouts_enabled),
    requirementsDue: stripeRequirementsDue,
    disabledReason: row?.customer_stripe_disabled_reason,
  });
  const canTakePayments =
    platformReady &&
    stripeConnected &&
    Boolean(row?.customer_stripe_charges_enabled) &&
    Boolean(row?.customer_stripe_payouts_enabled);
  const onlinePaymentEnabled = Boolean(row?.customer_payments_enabled) && canTakePayments;

  let onlinePaymentMessage =
    "Lorsque le paiement en ligne est active, vos clients peuvent regler directement leurs reservations sur votre boutique en ligne.";

  if (!platformReady) {
    onlinePaymentMessage =
      "La plateforme Stripe n'est pas encore configuree. La connexion du compte n'est pas disponible pour le moment.";
  } else if (!stripeConnected) {
    onlinePaymentMessage =
      "Connectez votre compte Stripe avant d'activer le paiement en ligne sur votre boutique.";
  } else if (!canTakePayments) {
    onlinePaymentMessage =
      "Finalisez la configuration Stripe pour activer les paiements et les virements avant de proposer le paiement en ligne.";
  }

  return {
    stripe: {
      platformReady,
      connected: stripeConnected,
      accountId: row?.customer_stripe_account_id || null,
      status: stripeStatus,
      statusLabel: buildStripeStatusLabel(stripeStatus),
      detailsSubmitted: Boolean(row?.customer_stripe_details_submitted),
      chargesEnabled: Boolean(row?.customer_stripe_charges_enabled),
      payoutsEnabled: Boolean(row?.customer_stripe_payouts_enabled),
      requirementsDue: stripeRequirementsDue,
      requirementsSummary: buildRequirementsSummary(stripeRequirementsDue),
      disabledReason: row?.customer_stripe_disabled_reason || null,
      displayName: row?.customer_stripe_display_name || null,
      country: row?.customer_stripe_country || null,
      connectedAt: row?.customer_stripe_configured_at || null,
      lastSyncAt: row?.customer_stripe_last_sync_at || null,
      syncError: normalizeOptionalText(syncError),
      legacyManualConfigurationPresent: Boolean(
        row?.customer_stripe_publishable_key ||
          row?.customer_stripe_secret_key_encrypted ||
          row?.customer_stripe_webhook_secret_encrypted
      ),
    },
    onlinePayment: {
      enabled: onlinePaymentEnabled,
      requested: Boolean(row?.customer_payments_enabled),
      canEnable: canTakePayments,
      status: onlinePaymentEnabled ? "enabled" : "disabled",
      message: onlinePaymentMessage,
    },
    overview: {
      paymentAvailable: onlinePaymentEnabled,
      status: onlinePaymentEnabled ? "payments_available" : "payments_unavailable",
      label: onlinePaymentEnabled ? "Paiements disponibles" : "Paiements indisponibles",
      message: onlinePaymentEnabled
        ? "Vos clients peuvent payer en ligne sur votre boutique."
        : onlinePaymentMessage,
    },
  };
};

const getCustomerPaymentSettingsRow = async (userId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM customer_payment_settings
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
};

const getProviderStripeSeed = async (userId) => {
  const { rows } = await query(
    `
      SELECT email, country
      FROM users
      WHERE id = $1
        AND account_role = 'provider'
      LIMIT 1
    `,
    [userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Prestataire introuvable.");
  }

  return rows[0];
};

const persistStripeSnapshot = async (
  userId,
  {
    accountId,
    accountStatus,
    configuredAt,
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    requirementsDue,
    disabledReason,
    displayName,
    country,
    autoDisableOnlinePayment = false,
  } = {}
) => {
  await query(
    `
      UPDATE customer_payment_settings
      SET customer_payments_enabled = CASE
            WHEN $3 THEN FALSE
            ELSE customer_payments_enabled
          END,
          customer_stripe_account_id = $2,
          customer_stripe_account_status = $4,
          customer_stripe_configured_at = $5,
          customer_stripe_details_submitted = $6,
          customer_stripe_charges_enabled = $7,
          customer_stripe_payouts_enabled = $8,
          customer_stripe_requirements_due_json = $9,
          customer_stripe_disabled_reason = $10,
          customer_stripe_display_name = $11,
          customer_stripe_country = $12,
          customer_stripe_last_sync_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      userId,
      accountId,
      autoDisableOnlinePayment,
      accountStatus,
      configuredAt,
      detailsSubmitted,
      chargesEnabled,
      payoutsEnabled,
      JSON.stringify(requirementsDue || []),
      normalizeOptionalText(disabledReason),
      normalizeOptionalText(displayName),
      normalizeOptionalText(country),
    ]
  );
};

const syncStripeAccountState = async (userId) => {
  await ensureUserSettingsRecords(userId);
  const currentRow = await getCustomerPaymentSettingsRow(userId);

  if (!currentRow?.customer_stripe_account_id) {
    return {
      row: currentRow,
      platformReady: Boolean((await getResolvedSuperAdminStripeConfiguration()).secretKey),
      syncError: "",
    };
  }

  const platformStripeConfig = await getResolvedSuperAdminStripeConfiguration();
  const platformReady = Boolean(platformStripeConfig.secretKey);

  if (!platformReady) {
    return {
      row: currentRow,
      platformReady: false,
      syncError: "",
    };
  }

  const account = await retrieveConnectAccount({
    secretKey: platformStripeConfig.secretKey,
    accountId: currentRow.customer_stripe_account_id,
  });
  const requirementsDue = [
    ...(Array.isArray(account?.requirements?.currently_due) ? account.requirements.currently_due : []),
    ...(Array.isArray(account?.requirements?.past_due) ? account.requirements.past_due : []),
  ].filter((entry, index, array) => array.indexOf(entry) === index);
  const chargesEnabled = Boolean(account?.charges_enabled);
  const payoutsEnabled = Boolean(account?.payouts_enabled);
  const nextStatus = resolveStripeAccountStatus({
    accountId: currentRow.customer_stripe_account_id,
    detailsSubmitted: Boolean(account?.details_submitted),
    chargesEnabled,
    payoutsEnabled,
    requirementsDue,
    disabledReason: account?.requirements?.disabled_reason,
  });

  await persistStripeSnapshot(userId, {
    accountId: currentRow.customer_stripe_account_id,
    accountStatus: nextStatus,
    configuredAt: currentRow.customer_stripe_configured_at || new Date().toISOString(),
    detailsSubmitted: Boolean(account?.details_submitted),
    chargesEnabled,
    payoutsEnabled,
    requirementsDue,
    disabledReason: account?.requirements?.disabled_reason || null,
    displayName:
      account?.business_profile?.name ||
      account?.settings?.dashboard?.display_name ||
      account?.email ||
      null,
    country: account?.country || null,
    autoDisableOnlinePayment: Boolean(currentRow.customer_payments_enabled) && !(chargesEnabled && payoutsEnabled),
  });

  return {
    row: await getCustomerPaymentSettingsRow(userId),
    platformReady: true,
    syncError: "",
  };
};

export const getCustomerPaymentSettings = async (userId) => {
  await ensureUserSettingsRecords(userId);

  try {
    const { row, platformReady, syncError } = await syncStripeAccountState(userId);
    return serializeCustomerPaymentSettings(row, { platformReady, syncError });
  } catch (error) {
    const platformStripeConfig = await getResolvedSuperAdminStripeConfiguration();
    const fallbackRow = await getCustomerPaymentSettingsRow(userId);

    return serializeCustomerPaymentSettings(fallbackRow, {
      platformReady: Boolean(platformStripeConfig.secretKey),
      syncError: error.message || "Impossible de verifier l'etat Stripe pour le moment.",
    });
  }
};

export const getCustomerPaymentSettingsSnapshot = async (userId) => {
  await ensureUserSettingsRecords(userId);
  const platformStripeConfig = await getResolvedSuperAdminStripeConfiguration();
  const row = await getCustomerPaymentSettingsRow(userId);
  return serializeCustomerPaymentSettings(row, {
    platformReady: Boolean(platformStripeConfig.secretKey),
  });
};

export const updateCustomerPaymentSettings = async (userId, payload = {}) => {
  await ensureUserSettingsRecords(userId);
  const currentRow = await getCustomerPaymentSettingsRow(userId);
  const requestedValue = payload.customerPaymentsEnabled ?? payload.onlinePaymentEnabled;

  if (typeof requestedValue !== "boolean") {
    throw new HttpError(400, "Le statut du paiement en ligne est invalide.");
  }

  if (requestedValue) {
    const synced = await syncStripeAccountState(userId);
    const nextSettings = serializeCustomerPaymentSettings(synced.row, {
      platformReady: synced.platformReady,
    });

    if (!nextSettings.onlinePayment.canEnable) {
      throw new HttpError(
        409,
        "Le paiement en ligne ne peut pas etre active tant que le compte Stripe n'est pas connecte et finalise."
      );
    }
  }

  await query(
    `
      UPDATE customer_payment_settings
      SET customer_payments_enabled = $2,
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId, requestedValue]
  );

  return getCustomerPaymentSettings(userId);
};

export const createCustomerPaymentsConnectLink = async (userId) => {
  await ensureUserSettingsRecords(userId);
  const platformStripeConfig = await getResolvedSuperAdminStripeConfiguration();

  if (!platformStripeConfig.secretKey) {
    throw new HttpError(
      503,
      "La plateforme Stripe n'est pas encore configuree. Impossible d'ouvrir la connexion du compte."
    );
  }

  const currentRow = await getCustomerPaymentSettingsRow(userId);
  let accountId = currentRow?.customer_stripe_account_id || null;

  if (!accountId) {
    const provider = await getProviderStripeSeed(userId);
    const account = await createConnectExpressAccount({
      secretKey: platformStripeConfig.secretKey,
      email: provider.email,
      country: normalizeCountry(provider.country),
      metadata: {
        userId,
        flow: "lokify_storefront",
      },
    });

    accountId = account.id;

    await persistStripeSnapshot(userId, {
      accountId,
      accountStatus: "pending",
      configuredAt: new Date().toISOString(),
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsDue: [],
      disabledReason: null,
      displayName: account?.email || null,
      country: account?.country || normalizeCountry(provider.country),
    });
  }

  const accountLink = await createConnectAccountOnboardingLink({
    secretKey: platformStripeConfig.secretKey,
    accountId,
    refreshUrl: buildSettingsReturnUrl("refresh"),
    returnUrl: buildSettingsReturnUrl("return"),
  });

  return {
    url: accountLink.url,
    expiresAt: accountLink.expires_at || null,
  };
};

export const disconnectCustomerPaymentsStripe = async (userId) => {
  await ensureUserSettingsRecords(userId);

  await query(
    `
      UPDATE customer_payment_settings
      SET customer_payments_enabled = FALSE,
          customer_stripe_account_id = NULL,
          customer_stripe_account_status = 'not_connected',
          customer_stripe_configured_at = NULL,
          customer_stripe_details_submitted = FALSE,
          customer_stripe_charges_enabled = FALSE,
          customer_stripe_payouts_enabled = FALSE,
          customer_stripe_requirements_due_json = '[]',
          customer_stripe_disabled_reason = NULL,
          customer_stripe_display_name = NULL,
          customer_stripe_country = NULL,
          customer_stripe_last_sync_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId]
  );

  return getCustomerPaymentSettings(userId);
};
