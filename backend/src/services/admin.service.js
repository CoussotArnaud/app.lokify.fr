import crypto from "crypto";

import bcrypt from "bcryptjs";

import { query } from "../config/db.js";
import { getLokifyPlanById } from "../config/lokify-plans.js";
import HttpError from "../utils/http-error.js";
import { isValidSiret, normalizeSiret } from "../utils/siret.js";
import { ensureUserSettingsRecords } from "./account-profile.service.js";
import { getVerifiedCompanyIdentity } from "./insee-sirene.service.js";
import { requestPasswordResetForUser } from "./password-reset.service.js";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trial"]);
const allowedProviderStatuses = new Set(["invited", "active", "blocked"]);
const allowedSubscriptionStatuses = new Set([
  "inactive",
  "trial",
  "active",
  "past_due",
  "canceled",
]);
const allowedPaymentStatuses = new Set([
  "paid",
  "pending",
  "unpaid",
  "overdue",
  "canceled",
  "trial",
  "expired",
  "unknown",
]);

const providerAdminSelect = `
  SELECT
    users.id,
    users.full_name,
    users.company_name,
    users.siret,
    users.siren,
    users.commercial_name,
    users.first_name,
    users.last_name,
    users.email,
    users.phone,
    users.country,
    users.address,
    users.postal_code,
    users.city,
    users.ape_code,
    users.establishment_admin_status,
    users.sirene_verification_status,
    users.sirene_verified_at,
    users.sirene_checked_at,
    users.account_role,
    users.provider_status,
    users.created_at,
    lokify_billing_settings.lokify_plan_id,
    lokify_billing_settings.lokify_plan_name,
    lokify_billing_settings.lokify_plan_price,
    lokify_billing_settings.lokify_plan_interval,
    lokify_billing_settings.lokify_subscription_status,
    lokify_billing_settings.lokify_subscription_start_at,
    lokify_billing_settings.lokify_subscription_end_at,
    lokify_billing_settings.lokify_stripe_customer_id,
    lokify_billing_settings.lokify_stripe_subscription_id,
    lokify_billing_settings.lokify_stripe_checkout_session_id,
    lokify_billing_settings.cancel_at_period_end,
    lokify_billing_settings.renewal_canceled_at,
    customer_payment_settings.customer_payments_enabled,
    customer_payment_settings.customer_stripe_account_status,
    customer_payment_settings.customer_stripe_publishable_key,
    customer_payment_settings.customer_stripe_secret_key_encrypted,
    customer_payment_settings.customer_stripe_account_id,
    customer_payment_settings.customer_stripe_configured_at,
    customer_payment_settings.customer_payment_status,
    customer_payment_settings.customer_last_payment_at,
    customer_payment_settings.customer_next_payment_due_at,
    customer_payment_settings.customer_payment_method_label,
    customer_payment_settings.customer_payment_status_updated_at,
    COALESCE(client_counts.total_clients, 0) AS total_clients,
    COALESCE(reservation_counts.total_reservations, 0) AS total_reservations,
    password_reset_activity.last_password_reset_requested_at
  FROM users
  LEFT JOIN lokify_billing_settings
    ON lokify_billing_settings.user_id = users.id
  LEFT JOIN customer_payment_settings
    ON customer_payment_settings.user_id = users.id
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS total_clients
    FROM clients
    GROUP BY user_id
  ) AS client_counts
    ON client_counts.user_id = users.id
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS total_reservations
    FROM reservations
    GROUP BY user_id
  ) AS reservation_counts
    ON reservation_counts.user_id = users.id
  LEFT JOIN (
    SELECT user_id, MAX(created_at) AS last_password_reset_requested_at
    FROM password_reset_tokens
    GROUP BY user_id
  ) AS password_reset_activity
    ON password_reset_activity.user_id = users.id
`;

const normalizeOptionalText = (value) => {
  const normalizedValue = String(value || "").trim();
  return normalizedValue || null;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeRecurringMonthlyRevenue = (price, interval) => {
  const normalizedPrice = Number(price || 0);
  const normalizedInterval = String(interval || "month").trim().toLowerCase();

  if (!normalizedPrice) {
    return 0;
  }

  return normalizedInterval === "year" ? normalizedPrice / 12 : normalizedPrice;
};

const normalizeRecurringAnnualRevenue = (price, interval) => {
  const normalizedPrice = Number(price || 0);
  const normalizedInterval = String(interval || "month").trim().toLowerCase();

  if (!normalizedPrice) {
    return 0;
  }

  return normalizedInterval === "year" ? normalizedPrice : normalizedPrice * 12;
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const readPayloadValue = (payload, keys) => {
  for (const key of keys) {
    if (hasOwn(payload, key)) {
      return payload[key];
    }
  }

  return undefined;
};

const parseDate = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const resolveDateValue = (value) => normalizeOptionalText(value) || null;

const getProviderSummaryRow = async (providerId) => {
  const { rows } = await query(
    `
      ${providerAdminSelect}
      WHERE users.id = $1
        AND users.account_role = 'provider'
      LIMIT 1
    `,
    [providerId]
  );

  return rows[0];
};

const hasOperationalAccess = (row) => {
  const endAt = parseDate(row.lokify_subscription_end_at);
  const isPeriodValid = !endAt || endAt.getTime() >= Date.now();

  return (
    row.provider_status === "active" &&
    ACTIVE_SUBSCRIPTION_STATUSES.has(String(row.lokify_subscription_status || "inactive")) &&
    isPeriodValid
  );
};

const resolvePaymentStatus = (row) => {
  const explicitStatus = String(row.customer_payment_status || "")
    .trim()
    .toLowerCase();

  if (allowedPaymentStatuses.has(explicitStatus) && explicitStatus !== "unknown") {
    return {
      status: explicitStatus,
      source: "stored",
    };
  }

  const subscriptionStatus = String(row.lokify_subscription_status || "inactive")
    .trim()
    .toLowerCase();
  const endAt = parseDate(row.lokify_subscription_end_at);
  const isExpired = endAt ? endAt.getTime() < Date.now() : false;

  if (subscriptionStatus === "active") {
    return { status: "paid", source: "derived" };
  }

  if (subscriptionStatus === "trial") {
    return { status: "trial", source: "derived" };
  }

  if (subscriptionStatus === "past_due") {
    return { status: isExpired ? "expired" : "overdue", source: "derived" };
  }

  if (subscriptionStatus === "canceled") {
    return { status: isExpired ? "expired" : "canceled", source: "derived" };
  }

  if (row.lokify_plan_id) {
    const startAt = parseDate(row.lokify_subscription_start_at);

    if (startAt && startAt.getTime() > Date.now()) {
      return { status: "pending", source: "derived" };
    }

    return { status: "unpaid", source: "derived" };
  }

  return {
    status: "unknown",
    source: explicitStatus === "unknown" ? "stored" : "derived",
  };
};

const buildSubscriptionHistory = (row, paymentState) => {
  const items = [];

  if (row.lokify_subscription_start_at) {
    items.push({
      id: `subscription-start-${row.lokify_subscription_start_at}`,
      at: row.lokify_subscription_start_at,
      label: "Debut d'abonnement",
      description: row.lokify_plan_name
        ? `Activation de la formule ${row.lokify_plan_name}.`
        : "Activation de l'abonnement.",
    });
  }

  if (row.customer_last_payment_at) {
    items.push({
      id: `payment-last-${row.customer_last_payment_at}`,
      at: row.customer_last_payment_at,
      label: "Dernier paiement",
      description: `Etat enregistre : ${paymentState.status}.`,
    });
  }

  if (row.renewal_canceled_at) {
    items.push({
      id: `renewal-stop-${row.renewal_canceled_at}`,
      at: row.renewal_canceled_at,
      label: "Renouvellement desactive",
      description: "Le compte restera actif jusqu'a la fin de la periode en cours.",
    });
  }

  if (row.lokify_subscription_end_at) {
    items.push({
      id: `subscription-end-${row.lokify_subscription_end_at}`,
      at: row.lokify_subscription_end_at,
      label: row.cancel_at_period_end ? "Fin d'abonnement prevue" : "Prochaine echeance",
      description: row.cancel_at_period_end
        ? "Acces maintenu jusqu'a la fin de la periode payee."
        : "Date de reference pour le prochain cycle.",
    });
  }

  return items.sort((left, right) => new Date(right.at) - new Date(left.at));
};

const serializeProviderSummary = (row) => {
  if (!row) {
    return null;
  }

  const paymentState = resolvePaymentStatus(row);
  const nextPaymentDueAt =
    row.customer_next_payment_due_at || row.lokify_subscription_end_at || null;
  const stripeConnected = Boolean(
    row.customer_stripe_account_id ||
      row.customer_stripe_publishable_key ||
      row.customer_stripe_secret_key_encrypted
  );

  return {
    id: row.id,
    internal_id: row.id,
    full_name: row.full_name,
    company_name: row.company_name || row.full_name || null,
    siret: row.siret || null,
    siren: row.siren || null,
    commercial_name: row.commercial_name || null,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    email: row.email,
    phone: row.phone || null,
    country: row.country || null,
    address: row.address || null,
    postal_code: row.postal_code || null,
    city: row.city || null,
    ape_code: row.ape_code || null,
    establishment_admin_status: row.establishment_admin_status || null,
    sirene_verification_status: row.sirene_verification_status || "not_checked",
    sirene_verified_at: row.sirene_verified_at || null,
    sirene_checked_at: row.sirene_checked_at || null,
    account_role: row.account_role,
    provider_status: row.provider_status,
    created_at: row.created_at,
    metrics: {
      totalClients: Number(row.total_clients || 0),
      totalReservations: Number(row.total_reservations || 0),
    },
    subscription: {
      lokifyPlanId: row.lokify_plan_id || null,
      lokifyPlanName: row.lokify_plan_name || null,
      lokifyPlanPrice:
        row.lokify_plan_price === null || row.lokify_plan_price === undefined
          ? null
          : Number(row.lokify_plan_price),
      lokifyPlanInterval: row.lokify_plan_interval || "month",
      lokifySubscriptionStatus: row.lokify_subscription_status || "inactive",
      lokifySubscriptionStartAt: row.lokify_subscription_start_at || null,
      lokifySubscriptionEndAt: row.lokify_subscription_end_at || null,
      lokifyStripeCustomerId: row.lokify_stripe_customer_id || null,
      lokifyStripeSubscriptionId: row.lokify_stripe_subscription_id || null,
      lokifyStripeCheckoutSessionId: row.lokify_stripe_checkout_session_id || null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      renewalCanceledAt: row.renewal_canceled_at || null,
      nextRenewalAt: row.lokify_subscription_end_at || null,
      canAccessOperationalModules: hasOperationalAccess(row),
      saasLifecycleStatus: hasOperationalAccess(row) ? "active" : "inactive",
      history: buildSubscriptionHistory(row, paymentState),
    },
    payments: {
      customerPaymentsEnabled: Boolean(row.customer_payments_enabled),
      customerStripeAccountStatus: row.customer_stripe_account_status || "not_configured",
      customerStripeAccountId: row.customer_stripe_account_id || null,
      customerStripeConfiguredAt: row.customer_stripe_configured_at || null,
      customerStripeConfigured: stripeConnected,
      stripeConnected,
      customerPaymentStatus: paymentState.status,
      customerPaymentStatusSource: paymentState.source,
      customerLastPaymentAt: row.customer_last_payment_at || null,
      customerNextPaymentDueAt: nextPaymentDueAt,
      customerPaymentMethodLabel: row.customer_payment_method_label || null,
      customerPaymentStatusUpdatedAt: row.customer_payment_status_updated_at || null,
    },
    security: {
      loginEmail: row.email,
      lastPasswordResetRequestedAt: row.last_password_reset_requested_at || null,
      lastInvitationSentAt: row.last_password_reset_requested_at || null,
      accountActivationStatus:
        row.provider_status === "invited"
          ? "pending"
          : row.provider_status === "blocked"
            ? "blocked"
            : "active",
    },
  };
};

const ensureProviderExists = async (providerId) => {
  const row = await getProviderSummaryRow(providerId);

  if (!row) {
    throw new HttpError(404, "Prestataire introuvable.");
  }

  return row;
};

const validateProviderPassword = (password, { required = false } = {}) => {
  if (!required && !normalizeOptionalText(password)) {
    return;
  }

  if (String(password || "").length < 6) {
    throw new HttpError(
      400,
      "Le mot de passe du prestataire doit contenir au moins 6 caracteres."
    );
  }
};

const validateProviderStatus = (providerStatus) => {
  const normalizedStatus = String(providerStatus || "invited").trim().toLowerCase();

  if (!allowedProviderStatuses.has(normalizedStatus)) {
    throw new HttpError(400, "Statut prestataire invalide.");
  }

  return normalizedStatus;
};

const validateSubscriptionStatus = (subscriptionStatus) => {
  if (!subscriptionStatus) {
    return null;
  }

  const normalizedStatus = String(subscriptionStatus).trim().toLowerCase();

  if (!allowedSubscriptionStatuses.has(normalizedStatus)) {
    throw new HttpError(400, "Statut d'abonnement invalide.");
  }

  return normalizedStatus;
};

const validatePaymentStatus = (paymentStatus) => {
  if (paymentStatus === undefined) {
    return undefined;
  }

  const normalizedStatus = String(paymentStatus || "unknown").trim().toLowerCase();

  if (!allowedPaymentStatuses.has(normalizedStatus)) {
    throw new HttpError(400, "Etat de paiement invalide.");
  }

  return normalizedStatus;
};

const validateOptionalSiret = (value) => {
  const normalized = normalizeSiret(value);

  if (!normalized) {
    return null;
  }

  if (!isValidSiret(normalized)) {
    throw new HttpError(400, "Le numero de SIRET est invalide.");
  }

  return normalized;
};

const upsertProviderBillingState = async (
  providerId,
  billingPayload = {},
  providerStatus = "active"
) => {
  await ensureUserSettingsRecords(providerId);

  const currentRow = await ensureProviderExists(providerId);
  const requestedPlanId =
    normalizeOptionalText(billingPayload.planId) || currentRow.lokify_plan_id || null;
  const plan = requestedPlanId ? getLokifyPlanById(requestedPlanId) : null;

  if (requestedPlanId && !plan) {
    throw new HttpError(404, "Formule Lokify introuvable.");
  }

  const nextSubscriptionStatus =
    validateSubscriptionStatus(billingPayload.subscriptionStatus) ||
    currentRow.lokify_subscription_status ||
    "inactive";
  const nextStartAt =
    resolveDateValue(billingPayload.subscriptionStartAt) ||
    currentRow.lokify_subscription_start_at ||
    null;
  const nextEndAt =
    resolveDateValue(billingPayload.subscriptionEndAt) ||
    currentRow.lokify_subscription_end_at ||
    null;
  const nextCancelAtPeriodEnd =
    typeof billingPayload.cancelAtPeriodEnd === "boolean"
      ? billingPayload.cancelAtPeriodEnd
      : Boolean(currentRow.cancel_at_period_end);
  const nextRenewalCanceledAt = nextCancelAtPeriodEnd
    ? currentRow.renewal_canceled_at || new Date().toISOString()
    : null;
  const effectiveHasAccess = (() => {
    const endAt = parseDate(nextEndAt);
    const isPeriodValid = !endAt || endAt.getTime() >= Date.now();

    return (
      providerStatus === "active" &&
      ACTIVE_SUBSCRIPTION_STATUSES.has(nextSubscriptionStatus) &&
      isPeriodValid
    );
  })();

  await query(
    `
      UPDATE lokify_billing_settings
      SET lokify_plan_id = $2,
          lokify_plan_name = $3,
          lokify_plan_price = $4,
          lokify_plan_interval = $5,
          lokify_subscription_status = $6,
          lokify_subscription_start_at = $7,
          lokify_subscription_end_at = $8,
          billing_environment = $9,
          subscription_locked = $10,
          access_restricted_by_subscription = $11,
          cancel_at_period_end = $12,
          renewal_canceled_at = $13,
          requested_lokify_plan_id = NULL,
          requested_lokify_plan_name = NULL,
          requested_lokify_plan_price = NULL,
          requested_lokify_plan_interval = NULL,
          requested_lokify_plan_note = NULL,
          requested_lokify_plan_requested_at = NULL,
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      providerId,
      plan?.id || null,
      plan?.name || null,
      plan?.price || null,
      plan?.interval || "month",
      nextSubscriptionStatus,
      nextStartAt,
      nextEndAt,
      "test",
      !effectiveHasAccess,
      !effectiveHasAccess,
      nextCancelAtPeriodEnd,
      nextRenewalCanceledAt,
    ]
  );
};

const upsertProviderPaymentState = async (providerId, paymentsPayload = {}) => {
  if (!paymentsPayload || typeof paymentsPayload !== "object") {
    return;
  }

  await ensureUserSettingsRecords(providerId);

  const { rows } = await query(
    `
      SELECT *
      FROM customer_payment_settings
      WHERE user_id = $1
      LIMIT 1
    `,
    [providerId]
  );
  const currentRow = rows[0] || {};
  const explicitPaymentStatus = validatePaymentStatus(
    paymentsPayload.paymentStatus ?? paymentsPayload.customerPaymentStatus
  );

  if (
    explicitPaymentStatus === undefined &&
    paymentsPayload.lastPaymentAt === undefined &&
    paymentsPayload.customerLastPaymentAt === undefined &&
    paymentsPayload.nextPaymentDueAt === undefined &&
    paymentsPayload.customerNextPaymentDueAt === undefined &&
    paymentsPayload.paymentMethodLabel === undefined &&
    paymentsPayload.customerPaymentMethodLabel === undefined
  ) {
    return;
  }

  const nextPaymentStatus =
    explicitPaymentStatus ?? currentRow.customer_payment_status ?? "unknown";
  const nextLastPaymentAt =
    resolveDateValue(
      paymentsPayload.lastPaymentAt ?? paymentsPayload.customerLastPaymentAt
    ) ||
    currentRow.customer_last_payment_at ||
    null;
  const nextPaymentDueAt =
    resolveDateValue(
      paymentsPayload.nextPaymentDueAt ?? paymentsPayload.customerNextPaymentDueAt
    ) ||
    currentRow.customer_next_payment_due_at ||
    null;
  const nextPaymentMethodLabel =
    normalizeOptionalText(
      paymentsPayload.paymentMethodLabel ?? paymentsPayload.customerPaymentMethodLabel
    ) ||
    currentRow.customer_payment_method_label ||
    null;

  await query(
    `
      UPDATE customer_payment_settings
      SET customer_payment_status = $2,
          customer_last_payment_at = $3,
          customer_next_payment_due_at = $4,
          customer_payment_method_label = $5,
          customer_payment_status_updated_at = CASE
            WHEN $6 THEN NOW()
            ELSE customer_payment_status_updated_at
          END,
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      providerId,
      nextPaymentStatus,
      nextLastPaymentAt,
      nextPaymentDueAt,
      nextPaymentMethodLabel,
      explicitPaymentStatus !== undefined,
    ]
  );
};

export const listProvidersForAdmin = async () => {
  const { rows } = await query(
    `
      ${providerAdminSelect}
      WHERE users.account_role = 'provider'
      ORDER BY users.created_at DESC
    `
  );

  return rows.map(serializeProviderSummary);
};

export const getProviderForAdmin = async (providerId) =>
  serializeProviderSummary(await ensureProviderExists(providerId));

export const getAdminOverview = async () => {
  const providers = await listProvidersForAdmin();
  const providersWithActiveLokifyRevenue = providers.filter(
    (provider) =>
      provider.provider_status === "active" &&
      provider.subscription.lokifySubscriptionStatus === "active"
  );
  const lokifyMonthlyRevenue = providersWithActiveLokifyRevenue.reduce(
    (sum, provider) =>
      sum +
      normalizeRecurringMonthlyRevenue(
        provider.subscription?.lokifyPlanPrice,
        provider.subscription?.lokifyPlanInterval
      ),
    0
  );
  const lokifyAnnualRevenue = providersWithActiveLokifyRevenue.reduce(
    (sum, provider) =>
      sum +
      normalizeRecurringAnnualRevenue(
        provider.subscription?.lokifyPlanPrice,
        provider.subscription?.lokifyPlanInterval
      ),
    0
  );
  const activeProviders = providers.filter((provider) => provider.provider_status === "active").length;

  return {
    metrics: {
      totalProviders: providers.length,
      activeProviders,
      activeProvidersCurrently: activeProviders,
      invitedProviders: providers.filter((provider) => provider.provider_status === "invited").length,
      blockedProviders: providers.filter((provider) => provider.provider_status === "blocked").length,
      activeSubscriptions: providers.filter(
        (provider) => provider.subscription.lokifySubscriptionStatus === "active"
      ).length,
      lokifyMonthlyRevenue,
      lokifyAnnualRevenue,
      providerStripeConfigured: providers.filter(
        (provider) => provider.payments.customerStripeConfigured
      ).length,
      paymentAlerts: providers.filter((provider) =>
        ["overdue", "unpaid", "expired"].includes(provider.payments.customerPaymentStatus)
      ).length,
      providersUpToDate: providers.filter((provider) =>
        ["paid", "trial"].includes(provider.payments.customerPaymentStatus)
      ).length,
    },
    providers,
  };
};

export const createProviderFromAdmin = async (payload = {}) => {
  const requestedCompanyName = normalizeOptionalText(payload.company_name ?? payload.companyName);
  const requestedFullName = normalizeOptionalText(payload.full_name ?? payload.fullName);
  const email = normalizeEmail(payload.email);
  const password = normalizeOptionalText(payload.password);
  const siret = validateOptionalSiret(payload.siret);
  const providerStatus = validateProviderStatus(
    payload.provider_status ?? payload.providerStatus ?? "invited"
  );
  const firstName = normalizeOptionalText(payload.first_name ?? payload.firstName);
  const lastName = normalizeOptionalText(payload.last_name ?? payload.lastName);
  const phone = normalizeOptionalText(payload.phone);
  const country = normalizeOptionalText(payload.country);
  const address = normalizeOptionalText(payload.address);
  const postalCode = normalizeOptionalText(payload.postal_code ?? payload.postalCode);
  const city = normalizeOptionalText(payload.city);
  const commercialNameInput = normalizeOptionalText(
    payload.commercial_name ?? payload.commercialName
  );
  const apeCodeInput = normalizeOptionalText(payload.ape_code ?? payload.apeCode);
  const sirenInput = normalizeOptionalText(payload.siren);

  if (!siret) {
    throw new HttpError(400, "Le numero de SIRET est obligatoire.");
  }

  validateProviderPassword(password, { required: false });
  const verifiedCompanyIdentity = await getVerifiedCompanyIdentity(siret);
  const verifiedCompany = verifiedCompanyIdentity.company || null;
  const companyName =
    requestedCompanyName ||
    normalizeOptionalText(verifiedCompany?.legalName) ||
    requestedFullName;
  const fullName = companyName || requestedFullName;
  const commercialName =
    commercialNameInput || normalizeOptionalText(verifiedCompany?.commercialName);
  const normalizedAddress = address || normalizeOptionalText(verifiedCompany?.address);
  const normalizedPostalCode =
    postalCode || normalizeOptionalText(verifiedCompany?.postalCode);
  const normalizedCity = city || normalizeOptionalText(verifiedCompany?.city);
  const normalizedApeCode = apeCodeInput || normalizeOptionalText(verifiedCompany?.apeCode);
  const normalizedSiren = sirenInput || normalizeOptionalText(verifiedCompany?.siren);
  const establishmentAdminStatus = normalizeOptionalText(
    verifiedCompany?.establishmentStatus
  );

  if (!fullName) {
    throw new HttpError(400, "Le nom du prestataire est obligatoire.");
  }

  if (!companyName) {
    throw new HttpError(400, "Le nom de la societe est obligatoire.");
  }

  if (!email) {
    throw new HttpError(400, "L'email du prestataire est obligatoire.");
  }

  const existingUser = await query("SELECT id FROM users WHERE email = $1", [email]);

  if (existingUser.rows[0]) {
    throw new HttpError(409, "Un utilisateur avec cet email existe deja.");
  }

  if (siret) {
    const existingSiret = await query(
      "SELECT id FROM users WHERE siret = $1 AND account_role = 'provider' LIMIT 1",
      [siret]
    );

    if (existingSiret.rows[0]) {
      throw new HttpError(409, "Un compte prestataire avec ce SIRET existe deja.");
    }
  }

  const providerId = crypto.randomUUID();
  const passwordSeed = password || crypto.randomBytes(24).toString("hex");
  const passwordHash = await bcrypt.hash(passwordSeed, 10);

  await query(
    `
      INSERT INTO users (
        id,
        full_name,
        company_name,
        siret,
        siren,
        commercial_name,
        first_name,
        last_name,
        email,
        password_hash,
        account_role,
        provider_status,
        phone,
        country,
        address,
        postal_code,
        city,
        ape_code,
        establishment_admin_status,
        sirene_verification_status,
        sirene_verified_at,
        sirene_checked_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        'provider',
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19,
        $20,
        $21
      )
    `,
    [
      providerId,
      fullName,
      companyName,
      siret,
      normalizedSiren,
      commercialName,
      firstName,
      lastName,
      email,
      passwordHash,
      providerStatus,
      phone,
      country,
      normalizedAddress,
      normalizedPostalCode,
      normalizedCity,
      normalizedApeCode,
      establishmentAdminStatus,
      verifiedCompanyIdentity.verificationStatus,
      verifiedCompanyIdentity.verifiedAt,
      verifiedCompanyIdentity.checkedAt,
    ]
  );

  await ensureUserSettingsRecords(providerId);

  if (payload.billing) {
    await upsertProviderBillingState(providerId, payload.billing, providerStatus);
  }

  if (payload.payments) {
    await upsertProviderPaymentState(providerId, payload.payments);
  }

  return serializeProviderSummary(await ensureProviderExists(providerId));
};

export const updateProviderFromAdmin = async (providerId, payload = {}) => {
  const currentProvider = await ensureProviderExists(providerId);
  const nextCompanyNameInput = readPayloadValue(payload, ["company_name", "companyName"]);
  const nextFullNameInput = readPayloadValue(payload, ["full_name", "fullName"]);
  const nextEmailInput = readPayloadValue(payload, ["email"]);
  const nextCompanyName =
    nextCompanyNameInput === undefined
      ? currentProvider.company_name || currentProvider.full_name
      : normalizeOptionalText(nextCompanyNameInput);
  const nextFullName =
    nextFullNameInput === undefined
      ? nextCompanyName || currentProvider.full_name
      : normalizeOptionalText(nextFullNameInput);
  const nextEmail =
    nextEmailInput === undefined ? currentProvider.email : normalizeEmail(nextEmailInput);
  const nextSiret =
    readPayloadValue(payload, ["siret"]) === undefined
      ? currentProvider.siret
      : validateOptionalSiret(readPayloadValue(payload, ["siret"]));
  const nextProviderStatus = validateProviderStatus(
    payload.provider_status ?? payload.providerStatus ?? currentProvider.provider_status
  );
  const nextPassword = normalizeOptionalText(payload.password);
  const nextFirstName =
    readPayloadValue(payload, ["first_name", "firstName"]) === undefined
      ? currentProvider.first_name
      : normalizeOptionalText(readPayloadValue(payload, ["first_name", "firstName"]));
  const nextLastName =
    readPayloadValue(payload, ["last_name", "lastName"]) === undefined
      ? currentProvider.last_name
      : normalizeOptionalText(readPayloadValue(payload, ["last_name", "lastName"]));
  const nextPhone =
    readPayloadValue(payload, ["phone"]) === undefined
      ? currentProvider.phone
      : normalizeOptionalText(readPayloadValue(payload, ["phone"]));
  const nextCountry =
    readPayloadValue(payload, ["country"]) === undefined
      ? currentProvider.country
      : normalizeOptionalText(readPayloadValue(payload, ["country"]));
  const nextAddress =
    readPayloadValue(payload, ["address"]) === undefined
      ? currentProvider.address
      : normalizeOptionalText(readPayloadValue(payload, ["address"]));
  const nextPostalCode =
    readPayloadValue(payload, ["postal_code", "postalCode"]) === undefined
      ? currentProvider.postal_code
      : normalizeOptionalText(readPayloadValue(payload, ["postal_code", "postalCode"]));
  const nextCity =
    readPayloadValue(payload, ["city"]) === undefined
      ? currentProvider.city
      : normalizeOptionalText(readPayloadValue(payload, ["city"]));

  if (!nextFullName) {
    throw new HttpError(400, "Le nom du prestataire est obligatoire.");
  }

  if (!nextEmail) {
    throw new HttpError(400, "L'email du prestataire est obligatoire.");
  }

  if (!nextCompanyName) {
    throw new HttpError(400, "Le nom de la societe est obligatoire.");
  }

  if (nextEmail !== currentProvider.email) {
    const existingUser = await query(
      "SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1",
      [nextEmail, providerId]
    );

    if (existingUser.rows[0]) {
      throw new HttpError(409, "Un utilisateur avec cet email existe deja.");
    }
  }

  if (nextSiret && nextSiret !== currentProvider.siret) {
    const existingSiret = await query(
      "SELECT id FROM users WHERE siret = $1 AND id <> $2 AND account_role = 'provider' LIMIT 1",
      [nextSiret, providerId]
    );

    if (existingSiret.rows[0]) {
      throw new HttpError(409, "Un compte prestataire avec ce SIRET existe deja.");
    }
  }

  validateProviderPassword(nextPassword, { required: false });

  await query(
    `
      UPDATE users
      SET full_name = $2,
          company_name = $3,
          siret = $4,
          first_name = $5,
          last_name = $6,
          email = $7,
          password_hash = COALESCE($8, password_hash),
          provider_status = $9,
          phone = $10,
          country = $11,
          address = $12,
          postal_code = $13,
          city = $14,
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      providerId,
      nextFullName,
      nextCompanyName,
      nextSiret,
      nextFirstName,
      nextLastName,
      nextEmail,
      nextPassword ? await bcrypt.hash(nextPassword, 10) : null,
      nextProviderStatus,
      nextPhone,
      nextCountry,
      nextAddress,
      nextPostalCode,
      nextCity,
    ]
  );

  if (payload.billing) {
    await upsertProviderBillingState(providerId, payload.billing, nextProviderStatus);
  }

  if (payload.payments) {
    await upsertProviderPaymentState(providerId, payload.payments);
  }

  return serializeProviderSummary(await ensureProviderExists(providerId));
};

export const requestProviderPasswordResetFromAdmin = async (
  providerId,
  requestedByUserId
) => {
  await ensureProviderExists(providerId);

  return requestPasswordResetForUser(providerId, {
    requestedByUserId,
    purpose: "password_reset",
  });
};

export const requestProviderInvitationFromAdmin = async (
  providerId,
  requestedByUserId
) => {
  const provider = await ensureProviderExists(providerId);

  return requestPasswordResetForUser(providerId, {
    requestedByUserId,
    purpose: provider.provider_status === "invited" ? "activation" : "password_reset",
  });
};

export const deleteProviderFromAdmin = async (providerId) => {
  await ensureProviderExists(providerId);

  await query("DELETE FROM users WHERE id = $1 AND account_role = 'provider'", [providerId]);
};
