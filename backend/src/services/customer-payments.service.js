import { query } from "../config/db.js";
import { ensureUserSettingsRecords, getUserAccountProfile } from "./account-profile.service.js";
import { encryptSecretValue } from "./secret-store.service.js";

const normalizeOptionalText = (value) => {
  const normalizedValue = String(value || "").trim();
  return normalizedValue || null;
};

const normalizeStripeMode = (value) => {
  const normalizedValue = String(value || "test").trim().toLowerCase();
  return normalizedValue === "live" ? "live" : "test";
};

export const getCustomerPaymentSettings = async (userId) => {
  await ensureUserSettingsRecords(userId);
  const profile = await getUserAccountProfile(userId);

  return {
    customerPayments: profile.customerPayments,
    security: {
      secretsStoredServerSideOnly: true,
      sensitiveFieldsMasked: true,
    },
    message:
      "Cette configuration Stripe est strictement reservee au prestataire courant et stockee cote serveur.",
  };
};

export const updateCustomerPaymentSettings = async (userId, payload = {}) => {
  await ensureUserSettingsRecords(userId);

  const currentSettings = await query(
    `
      SELECT *
      FROM customer_payment_settings
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );
  const currentRow = currentSettings.rows[0];
  const publishableKey =
    normalizeOptionalText(payload.publishableKey ?? payload.customerStripePublishableKey) ||
    currentRow?.customer_stripe_publishable_key ||
    null;
  const rawSecretKey =
    normalizeOptionalText(payload.secretKey ?? payload.customerStripeSecretKey) || null;
  const rawWebhookSecret =
    normalizeOptionalText(payload.webhookSecret ?? payload.customerStripeWebhookSecret) || null;
  const customerStripeAccountId =
    normalizeOptionalText(payload.accountId ?? payload.customerStripeAccountId) ||
    currentRow?.customer_stripe_account_id ||
    null;
  const customerStripeMode = normalizeStripeMode(
    payload.customerStripeMode ?? payload.stripeMode ?? currentRow?.customer_stripe_mode
  );
  const customerPaymentsEnabled =
    typeof payload.customerPaymentsEnabled === "boolean"
      ? payload.customerPaymentsEnabled
      : Boolean(currentRow?.customer_payments_enabled);
  const hasConfiguredKeys = Boolean(
    publishableKey ||
      rawSecretKey ||
      customerStripeAccountId ||
      currentRow?.customer_stripe_publishable_key ||
      currentRow?.customer_stripe_secret_key_encrypted ||
      currentRow?.customer_stripe_account_id
  );

  await query(
    `
      UPDATE customer_payment_settings
      SET customer_payments_enabled = $2,
          customer_stripe_mode = $3,
          customer_stripe_publishable_key = $4,
          customer_stripe_secret_key_encrypted = $5,
          customer_stripe_webhook_secret_encrypted = $6,
          customer_stripe_account_id = $7,
          customer_stripe_account_status = $8,
          customer_stripe_configured_at = CASE WHEN $9 THEN NOW() ELSE customer_stripe_configured_at END,
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      userId,
      customerPaymentsEnabled,
      customerStripeMode,
      publishableKey,
      rawSecretKey
        ? encryptSecretValue(rawSecretKey)
        : currentRow?.customer_stripe_secret_key_encrypted || null,
      rawWebhookSecret
        ? encryptSecretValue(rawWebhookSecret)
        : currentRow?.customer_stripe_webhook_secret_encrypted || null,
      customerStripeAccountId,
      hasConfiguredKeys ? "configured" : "not_configured",
      hasConfiguredKeys,
    ]
  );

  return getCustomerPaymentSettings(userId);
};
