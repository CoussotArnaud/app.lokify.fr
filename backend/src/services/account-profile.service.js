import env from "../config/env.js";
import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";
import { decryptSecretValue, maskSensitiveValue } from "./secret-store.service.js";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trial"]);

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  return Number(value);
};

const buildDisplayEmail = (row, authContext = {}) =>
  String(authContext.displayEmail || row.system_email || row.email || "").trim().toLowerCase();

const hasCurrentSubscriptionAccess = (row) => {
  const subscriptionStatus = String(row.lokify_subscription_status || "inactive").toLowerCase();
  const subscriptionEndAt = row.lokify_subscription_end_at
    ? new Date(row.lokify_subscription_end_at)
    : null;
  const isPeriodStillValid =
    !subscriptionEndAt || Number.isNaN(subscriptionEndAt.getTime())
      ? true
      : subscriptionEndAt.getTime() >= Date.now();

  return ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus) && isPeriodStillValid;
};

export const ensureUserSettingsRecords = async (userId) => {
  await query(
    `
      INSERT INTO lokify_billing_settings (
        user_id,
        billing_environment,
        lokify_subscription_status,
        subscription_locked,
        access_restricted_by_subscription,
        cancel_at_period_end
      )
      VALUES ($1, $2, 'inactive', TRUE, TRUE, FALSE)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId, env.lokifyBillingEnvironment]
  );

  await query(
    `
      INSERT INTO customer_payment_settings (
        user_id,
        customer_payments_enabled,
        customer_stripe_mode,
        customer_stripe_account_status,
        customer_payment_status
      )
      VALUES ($1, FALSE, 'test', 'not_configured', 'unknown')
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
};

const mapProfileRow = (row, authContext = {}) => {
  const displayEmail = buildDisplayEmail(row, authContext);
  const accountRole = row.account_role || "provider";
  const providerStatus = row.provider_status || "active";
  const isSuperAdmin = accountRole === "super_admin";
  const isProvider = accountRole === "provider";
  const subscriptionHasAccess = isProvider && hasCurrentSubscriptionAccess(row);
  const canAccessOperationalModules =
    isProvider && providerStatus === "active" && subscriptionHasAccess;
  const subscriptionLocked = isProvider ? !canAccessOperationalModules : false;
  const accessRestrictedBySubscription = isProvider ? !canAccessOperationalModules : false;
  const customerStripeSecretPreview = row.customer_stripe_secret_key_encrypted
    ? maskSensitiveValue(decryptSecretValue(row.customer_stripe_secret_key_encrypted), {
        start: 8,
        end: 4,
      })
    : null;
  const customerStripeWebhookPreview = row.customer_stripe_webhook_secret_encrypted
    ? maskSensitiveValue(decryptSecretValue(row.customer_stripe_webhook_secret_encrypted), {
        start: 8,
        end: 4,
      })
    : null;

  return {
    id: row.id,
    full_name: row.full_name,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    email: displayEmail || row.system_email,
    system_email:
      row.system_email && row.system_email !== displayEmail ? row.system_email : undefined,
    phone: row.phone || null,
    country: row.country || null,
    address: row.address || null,
    postal_code: row.postal_code || null,
    city: row.city || null,
    created_at: row.created_at,
    account_role: accountRole,
    provider_status: providerStatus,
    is_super_admin: isSuperAdmin,
    is_provider: isProvider,
    session_profile: authContext.sessionProfile || "standard",
    lokifyBilling: {
      lokifyPlanId: row.lokify_plan_id || null,
      lokifyPlanName: row.lokify_plan_name || null,
      lokifyPlanPrice: row.lokify_plan_price === null ? null : toNumber(row.lokify_plan_price),
      lokifyPlanInterval: row.lokify_plan_interval || "month",
      lokifySubscriptionStatus: row.lokify_subscription_status || "inactive",
      lokifySubscriptionStartAt: row.lokify_subscription_start_at || null,
      lokifySubscriptionEndAt: row.lokify_subscription_end_at || null,
      lokifyStripeCustomerIdPresent: Boolean(row.lokify_stripe_customer_id),
      lokifyStripeSubscriptionIdPresent: Boolean(row.lokify_stripe_subscription_id),
      lokifyStripeCheckoutSessionId: row.lokify_stripe_checkout_session_id || null,
      billingEnvironment: row.billing_environment || env.lokifyBillingEnvironment,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      renewalCanceledAt: row.renewal_canceled_at || null,
      subscriptionLocked,
      accessRestrictedBySubscription,
    },
    customerPayments: {
      customerPaymentsEnabled: Boolean(row.customer_payments_enabled),
      customerStripeMode: row.customer_stripe_mode || "test",
      customerStripePublishableKeyConfigured: Boolean(row.customer_stripe_publishable_key),
      customerStripePublishableKeyPreview: row.customer_stripe_publishable_key
        ? maskSensitiveValue(row.customer_stripe_publishable_key, { start: 8, end: 4 })
        : null,
      customerStripeSecretKeyConfigured: Boolean(row.customer_stripe_secret_key_encrypted),
      customerStripeSecretKeyPreview: customerStripeSecretPreview,
      customerStripeWebhookSecretConfigured: Boolean(row.customer_stripe_webhook_secret_encrypted),
      customerStripeWebhookSecretPreview: customerStripeWebhookPreview,
      customerStripeAccountId: row.customer_stripe_account_id || null,
      customerStripeAccountStatus: row.customer_stripe_account_status || "not_configured",
      customerStripeConfiguredAt: row.customer_stripe_configured_at || null,
      customerPaymentStatus: row.customer_payment_status || "unknown",
      customerLastPaymentAt: row.customer_last_payment_at || null,
      customerNextPaymentDueAt: row.customer_next_payment_due_at || null,
      customerPaymentMethodLabel: row.customer_payment_method_label || null,
      customerPaymentStatusUpdatedAt: row.customer_payment_status_updated_at || null,
    },
    permissions: {
      canAccessAdminInterface: isSuperAdmin,
      canManageProviders: isSuperAdmin,
      canManageProviderSubscriptions: isSuperAdmin,
      canManagePlatformStripe: isSuperAdmin,
      canAccessOperationalModules,
      canAccessBilling: isProvider,
      canAccessCustomerPaymentSettings: isProvider,
      canManageClients: isProvider && providerStatus === "active",
      canManageReservations: isProvider && providerStatus === "active",
      canManageCatalog: isProvider && providerStatus === "active",
      accessRestrictedBySubscription,
    },
  };
};

export const getUserAccountProfile = async (userId, authContext = {}) => {
  await ensureUserSettingsRecords(userId);

  const { rows } = await query(
    `
      SELECT
        users.id,
        users.full_name,
        users.first_name,
        users.last_name,
        users.email AS system_email,
        users.phone,
        users.country,
        users.address,
        users.postal_code,
        users.city,
        users.created_at,
        users.account_role,
        users.provider_status,
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
        lokify_billing_settings.billing_environment,
        lokify_billing_settings.cancel_at_period_end,
        lokify_billing_settings.renewal_canceled_at,
        customer_payment_settings.customer_payments_enabled,
        customer_payment_settings.customer_stripe_mode,
        customer_payment_settings.customer_stripe_publishable_key,
        customer_payment_settings.customer_stripe_secret_key_encrypted,
        customer_payment_settings.customer_stripe_webhook_secret_encrypted,
        customer_payment_settings.customer_stripe_account_id,
        customer_payment_settings.customer_stripe_account_status,
        customer_payment_settings.customer_stripe_configured_at,
        customer_payment_settings.customer_payment_status,
        customer_payment_settings.customer_last_payment_at,
        customer_payment_settings.customer_next_payment_due_at,
        customer_payment_settings.customer_payment_method_label,
        customer_payment_settings.customer_payment_status_updated_at
      FROM users
      LEFT JOIN lokify_billing_settings
        ON lokify_billing_settings.user_id = users.id
      LEFT JOIN customer_payment_settings
        ON customer_payment_settings.user_id = users.id
      WHERE users.id = $1
    `,
    [userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Utilisateur introuvable.");
  }

  return mapProfileRow(rows[0], authContext);
};
