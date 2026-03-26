import env from "../config/env.js";
import { query } from "../config/db.js";
import { lokifyPlanCatalog } from "../config/lokify-plans.js";
import {
  decryptSecretValue,
  encryptSecretValue,
  maskSensitiveValue,
} from "./secret-store.service.js";

const PLATFORM_SETTINGS_KEY = "platform";

const normalizeOptionalText = (value) => {
  const normalizedValue = String(value || "").trim();
  return normalizedValue || null;
};

const parsePriceIds = (value) => {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const buildPriceIdSummary = (priceIds) =>
  Object.fromEntries(
    lokifyPlanCatalog.map((plan) => {
      const configuredValue = normalizeOptionalText(priceIds?.[plan.id]);

      return [
        plan.id,
        {
          configured: Boolean(configuredValue),
          preview: configuredValue
            ? maskSensitiveValue(configuredValue, { start: 8, end: 4 })
            : null,
        },
      ];
    })
  );

export const ensurePlatformStripeSettingsRecord = async () => {
  await query(
    `
      INSERT INTO super_admin_stripe_settings (settings_key, subscription_price_ids_json)
      VALUES ($1, '{}')
      ON CONFLICT (settings_key) DO NOTHING
    `,
    [PLATFORM_SETTINGS_KEY]
  );
};

const getPlatformStripeSettingsRow = async () => {
  await ensurePlatformStripeSettingsRecord();

  const { rows } = await query(
    `
      SELECT
        super_admin_stripe_settings.*,
        users.full_name AS updated_by_name
      FROM super_admin_stripe_settings
      LEFT JOIN users ON users.id = super_admin_stripe_settings.updated_by
      WHERE super_admin_stripe_settings.settings_key = $1
      LIMIT 1
    `,
    [PLATFORM_SETTINGS_KEY]
  );

  return rows[0];
};

export const getSuperAdminStripeSettings = async () => {
  const row = await getPlatformStripeSettingsRow();
  const secretKey = decryptSecretValue(row?.stripe_secret_key_encrypted);
  const webhookSecret = decryptSecretValue(row?.stripe_webhook_secret_encrypted);
  const priceIds = parsePriceIds(row?.subscription_price_ids_json);

  return {
    stripeSettings: {
      stripePublishableKeyConfigured: Boolean(row?.stripe_publishable_key),
      stripePublishableKeyPreview: row?.stripe_publishable_key
        ? maskSensitiveValue(row.stripe_publishable_key, { start: 8, end: 4 })
        : null,
      stripeSecretKeyConfigured: Boolean(secretKey),
      stripeSecretKeyPreview: secretKey
        ? maskSensitiveValue(secretKey, { start: 8, end: 4 })
        : null,
      stripeWebhookSecretConfigured: Boolean(webhookSecret),
      stripeWebhookSecretPreview: webhookSecret
        ? maskSensitiveValue(webhookSecret, { start: 8, end: 4 })
        : null,
      subscriptionPriceIds: buildPriceIdSummary(priceIds),
      updatedAt: row?.updated_at || null,
      updatedBy: row?.updated_by_name || null,
    },
  };
};

export const updateSuperAdminStripeSettings = async (payload = {}, updatedByUserId) => {
  const currentRow = await getPlatformStripeSettingsRow();
  const currentPriceIds = parsePriceIds(currentRow?.subscription_price_ids_json);
  const nextPriceIds = { ...currentPriceIds };

  lokifyPlanCatalog.forEach((plan) => {
    const nextValue = normalizeOptionalText(payload.priceIds?.[plan.id]);

    if (nextValue) {
      nextPriceIds[plan.id] = nextValue;
    }
  });

  const publishableKey =
    normalizeOptionalText(payload.publishableKey ?? payload.stripePublishableKey) ||
    currentRow?.stripe_publishable_key ||
    null;
  const rawSecretKey =
    normalizeOptionalText(payload.secretKey ?? payload.stripeSecretKey) || null;
  const rawWebhookSecret =
    normalizeOptionalText(payload.webhookSecret ?? payload.stripeWebhookSecret) || null;

  await query(
    `
      UPDATE super_admin_stripe_settings
      SET stripe_publishable_key = $2,
          stripe_secret_key_encrypted = $3,
          stripe_webhook_secret_encrypted = $4,
          subscription_price_ids_json = $5,
          updated_by = $6,
          updated_at = NOW()
      WHERE settings_key = $1
    `,
    [
      PLATFORM_SETTINGS_KEY,
      publishableKey,
      rawSecretKey ? encryptSecretValue(rawSecretKey) : currentRow?.stripe_secret_key_encrypted || null,
      rawWebhookSecret
        ? encryptSecretValue(rawWebhookSecret)
        : currentRow?.stripe_webhook_secret_encrypted || null,
      JSON.stringify(nextPriceIds),
      updatedByUserId,
    ]
  );

  return getSuperAdminStripeSettings();
};

export const getResolvedSuperAdminStripeConfiguration = async () => {
  const row = await getPlatformStripeSettingsRow();
  const databasePublishableKey = normalizeOptionalText(row?.stripe_publishable_key);
  const databaseSecretKey = normalizeOptionalText(
    decryptSecretValue(row?.stripe_secret_key_encrypted)
  );
  const databaseWebhookSecret = normalizeOptionalText(
    decryptSecretValue(row?.stripe_webhook_secret_encrypted)
  );

  return {
    publishableKey: databasePublishableKey || env.lokifyStripeTestPublishableKey || "",
    secretKey: databaseSecretKey || env.lokifyStripeTestSecretKey || "",
    webhookSecret: databaseWebhookSecret || env.lokifyStripeTestWebhookSecret || "",
    priceIds: parsePriceIds(row?.subscription_price_ids_json),
  };
};
