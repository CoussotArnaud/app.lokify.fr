import crypto from "crypto";

import env from "../config/env.js";
import { getLokifyPlanById, lokifyPlanCatalog } from "../config/lokify-plans.js";
import { query } from "../config/db.js";
import { ensureUserSettingsRecords, getUserAccountProfile } from "./account-profile.service.js";
import { getResolvedSuperAdminStripeConfiguration } from "./platform-stripe-settings.service.js";
import {
  createStripeCheckoutSession,
  fetchStripeCheckoutSession,
  fetchStripeSubscription,
  verifyStripeWebhookSignature,
} from "./stripe-test-checkout.service.js";
import HttpError from "../utils/http-error.js";

const checkoutStates = new Set(["pending", "completed", "canceled", "expired"]);
const stripeManagedStatuses = new Set(["trialing", "active", "past_due", "canceled", "unpaid"]);

const mapStripeStatusToLokifyStatus = (stripeStatus) => {
  if (stripeStatus === "active") {
    return "active";
  }

  if (stripeStatus === "trialing") {
    return "trial";
  }

  if (stripeStatus === "past_due" || stripeStatus === "unpaid") {
    return "past_due";
  }

  return "canceled";
};

const buildLocalCheckoutSessionId = () => `lokify_test_${crypto.randomUUID().replace(/-/g, "")}`;

const serializeCheckoutSession = (row) => ({
  sessionId: row.session_id,
  provider: row.provider,
  checkoutState: row.checkout_state,
  plan: {
    id: row.lokify_plan_id,
    name: row.lokify_plan_name,
    price: Number(row.lokify_plan_price || 0),
    interval: row.lokify_plan_interval,
  },
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  completedAt: row.completed_at,
});

const resolveCheckoutProvider = async () => {
  const platformStripe = await getResolvedSuperAdminStripeConfiguration();

  return {
    provider: platformStripe.secretKey ? "stripe" : "simulation",
    stripe: platformStripe,
  };
};

const getCheckoutSessionRecord = async (userId, sessionId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM lokify_checkout_sessions
      WHERE session_id = $1
        AND user_id = $2
    `,
    [sessionId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Session de checkout introuvable.");
  }

  return rows[0];
};

const upsertCheckoutSessionRecord = async ({
  userId,
  sessionId,
  provider,
  plan,
  checkoutState = "pending",
  expiresAt = null,
  stripeCustomerId = null,
  stripeSubscriptionId = null,
  checkoutUrl = null,
}) => {
  if (!checkoutStates.has(checkoutState)) {
    throw new HttpError(500, "Etat de checkout invalide.");
  }

  await query(
    `
      INSERT INTO lokify_checkout_sessions (
        session_id,
        user_id,
        provider,
        lokify_plan_id,
        lokify_plan_name,
        lokify_plan_price,
        lokify_plan_interval,
        checkout_state,
        expires_at,
        stripe_customer_id,
        stripe_subscription_id,
        checkout_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (session_id) DO UPDATE
      SET provider = EXCLUDED.provider,
          lokify_plan_id = EXCLUDED.lokify_plan_id,
          lokify_plan_name = EXCLUDED.lokify_plan_name,
          lokify_plan_price = EXCLUDED.lokify_plan_price,
          lokify_plan_interval = EXCLUDED.lokify_plan_interval,
          checkout_state = EXCLUDED.checkout_state,
          expires_at = EXCLUDED.expires_at,
          stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, lokify_checkout_sessions.stripe_customer_id),
          stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, lokify_checkout_sessions.stripe_subscription_id),
          checkout_url = COALESCE(EXCLUDED.checkout_url, lokify_checkout_sessions.checkout_url),
          updated_at = NOW()
    `,
    [
      sessionId,
      userId,
      provider,
      plan.id,
      plan.name,
      plan.price,
      plan.interval,
      checkoutState,
      expiresAt,
      stripeCustomerId,
      stripeSubscriptionId,
      checkoutUrl,
    ]
  );
};

const updateCheckoutState = async ({
  sessionId,
  checkoutState,
  stripeCustomerId = null,
  stripeSubscriptionId = null,
  completedAt = null,
}) => {
  await query(
    `
      UPDATE lokify_checkout_sessions
      SET checkout_state = $2,
          stripe_customer_id = COALESCE($3, stripe_customer_id),
          stripe_subscription_id = COALESCE($4, stripe_subscription_id),
          completed_at = COALESCE($5, completed_at),
          updated_at = NOW()
      WHERE session_id = $1
    `,
    [sessionId, checkoutState, stripeCustomerId, stripeSubscriptionId, completedAt]
  );
};

const updateLokifyBillingRecord = async ({
  userId,
  plan,
  status,
  startAt = null,
  endAt = null,
  checkoutSessionId = null,
  stripeCustomerId = null,
  stripeSubscriptionId = null,
  cancelAtPeriodEnd = false,
  renewalCanceledAt = null,
}) => {
  const normalizedStatus = String(status || "inactive").trim().toLowerCase();
  const subscriptionEndAt = endAt ? new Date(endAt) : null;
  const isPeriodValid =
    !subscriptionEndAt || Number.isNaN(subscriptionEndAt.getTime())
      ? true
      : subscriptionEndAt.getTime() >= Date.now();
  const hasOperationalAccess =
    ["active", "trial"].includes(normalizedStatus) && isPeriodValid;

  await ensureUserSettingsRecords(userId);
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
          lokify_stripe_customer_id = COALESCE($9, lokify_stripe_customer_id),
          lokify_stripe_subscription_id = COALESCE($10, lokify_stripe_subscription_id),
          lokify_stripe_checkout_session_id = COALESCE($11, lokify_stripe_checkout_session_id),
          billing_environment = $12,
          subscription_locked = $13,
          access_restricted_by_subscription = $14,
          cancel_at_period_end = $15,
          renewal_canceled_at = $16,
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      userId,
      plan?.id || null,
      plan?.name || null,
      plan?.price || null,
      plan?.interval || "month",
      normalizedStatus,
      startAt,
      endAt,
      stripeCustomerId,
      stripeSubscriptionId,
      checkoutSessionId,
      env.lokifyBillingEnvironment,
      !hasOperationalAccess,
      !hasOperationalAccess,
      cancelAtPeriodEnd,
      renewalCanceledAt,
    ]
  );
};

const activateLokifySubscription = async ({
  userId,
  plan,
  checkoutSessionId,
  stripeCustomerId = null,
  stripeSubscriptionId = null,
  startAt = null,
  endAt = null,
}) => {
  const subscriptionStartAt = startAt || new Date().toISOString();
  const subscriptionEndAt =
    endAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await updateLokifyBillingRecord({
    userId,
    plan,
    status: "active",
    startAt: subscriptionStartAt,
    endAt: subscriptionEndAt,
    checkoutSessionId,
    stripeCustomerId,
    stripeSubscriptionId,
    cancelAtPeriodEnd: false,
    renewalCanceledAt: null,
  });
};

const recordProcessedWebhookEvent = async (eventId, eventType) => {
  const { rows } = await query(
    `
      INSERT INTO lokify_webhook_events (event_id, event_type, processed_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `,
    [eventId, eventType]
  );

  return Boolean(rows[0]);
};

const syncStripeSubscriptionStatus = async ({
  userId,
  sessionId,
  stripeSession,
  stripeSubscription,
}) => {
  const plan =
    getLokifyPlanById(
      stripeSubscription.metadata?.planId || stripeSession.metadata?.planId
    ) || null;

  if (!plan) {
    throw new HttpError(502, "Impossible d'associer la session Stripe a une formule Lokify.");
  }

  const mappedStatus = mapStripeStatusToLokifyStatus(stripeSubscription.status);
  const startAt = stripeSubscription.current_period_start
    ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
    : new Date().toISOString();
  const endAt = stripeSubscription.current_period_end
    ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
    : null;

  await updateLokifyBillingRecord({
    userId,
    plan,
    status: mappedStatus,
    startAt,
    endAt,
    checkoutSessionId: sessionId,
    stripeCustomerId: stripeSession.customer || stripeSubscription.customer || null,
    stripeSubscriptionId: stripeSubscription.id || stripeSession.subscription || null,
    cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
    renewalCanceledAt: stripeSubscription.cancel_at_period_end ? new Date().toISOString() : null,
  });

  await updateCheckoutState({
    sessionId,
    checkoutState: mappedStatus === "active" ? "completed" : "pending",
    stripeCustomerId: stripeSession.customer || stripeSubscription.customer || null,
    stripeSubscriptionId: stripeSubscription.id || stripeSession.subscription || null,
    completedAt: mappedStatus === "active" ? new Date().toISOString() : null,
  });
};

export const getLokifyBillingOverview = async (userId) => {
  const [profile, checkoutConfig] = await Promise.all([
    getUserAccountProfile(userId),
    resolveCheckoutProvider(),
  ]);

  return {
    plans: lokifyPlanCatalog,
    currentUser: profile,
    lokifySubscription: profile.lokifyBilling,
    checkout: {
      provider: checkoutConfig.provider,
      billingEnvironment: env.lokifyBillingEnvironment,
      stripeConfigured: Boolean(checkoutConfig.stripe.secretKey),
      webhookReady: Boolean(checkoutConfig.stripe.webhookSecret),
      publishableKeyConfigured: Boolean(checkoutConfig.stripe.publishableKey),
      liveModeEnabled: false,
    },
  };
};

export const createLokifyCheckoutSession = async (user, planId) => {
  const plan = getLokifyPlanById(planId);

  if (!plan) {
    throw new HttpError(404, "Formule Lokify introuvable.");
  }

  const checkoutConfig = await resolveCheckoutProvider();

  if (checkoutConfig.provider === "stripe") {
    const stripeSession = await createStripeCheckoutSession({
      secretKey: checkoutConfig.stripe.secretKey,
      user,
      plan,
      existingCustomerId: null,
      stripePriceId: checkoutConfig.stripe.priceIds?.[plan.id] || null,
    });

    await upsertCheckoutSessionRecord({
      userId: user.id,
      sessionId: stripeSession.id,
      provider: checkoutConfig.provider,
      plan,
      checkoutState: "pending",
      expiresAt: stripeSession.expires_at
        ? new Date(stripeSession.expires_at * 1000).toISOString()
        : null,
      stripeCustomerId: stripeSession.customer || null,
      stripeSubscriptionId: null,
      checkoutUrl: stripeSession.url || null,
    });

    return {
      provider: checkoutConfig.provider,
      sessionId: stripeSession.id,
      checkoutUrl: stripeSession.url,
      billingEnvironment: env.lokifyBillingEnvironment,
    };
  }

  const sessionId = buildLocalCheckoutSessionId();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await upsertCheckoutSessionRecord({
    userId: user.id,
    sessionId,
    provider: checkoutConfig.provider,
    plan,
    checkoutState: "pending",
    expiresAt,
  });

  return {
    provider: checkoutConfig.provider,
    sessionId,
    redirectPath: `/abonnement/checkout-test?sessionId=${encodeURIComponent(sessionId)}`,
    billingEnvironment: env.lokifyBillingEnvironment,
  };
};

export const getLokifyCheckoutSession = async (userId, sessionId) => {
  const row = await getCheckoutSessionRecord(userId, sessionId);
  return serializeCheckoutSession(row);
};

export const finalizeLokifyCheckoutSession = async (userId, sessionId) => {
  const session = await getCheckoutSessionRecord(userId, sessionId);

  if (session.provider === "simulation") {
    return {
      checkoutSession: serializeCheckoutSession(session),
      currentUser: await getUserAccountProfile(userId),
    };
  }

  const checkoutConfig = await resolveCheckoutProvider();
  const stripeSession = await fetchStripeCheckoutSession(sessionId, checkoutConfig.stripe.secretKey);
  const stripeSubscriptionId =
    typeof stripeSession.subscription === "string"
      ? stripeSession.subscription
      : stripeSession.subscription?.id;

  if (!stripeSubscriptionId) {
    return {
      checkoutSession: serializeCheckoutSession(session),
      currentUser: await getUserAccountProfile(userId),
    };
  }

  const stripeSubscription = await fetchStripeSubscription(
    stripeSubscriptionId,
    checkoutConfig.stripe.secretKey
  );

  if (!stripeManagedStatuses.has(stripeSubscription.status)) {
    throw new HttpError(502, "Statut Stripe de l'abonnement inconnu.");
  }

  await syncStripeSubscriptionStatus({
    userId,
    sessionId,
    stripeSession,
    stripeSubscription,
  });

  const refreshedSession = await getCheckoutSessionRecord(userId, sessionId);

  return {
    checkoutSession: serializeCheckoutSession(refreshedSession),
    currentUser: await getUserAccountProfile(userId),
  };
};

export const completeSimulationCheckoutSession = async (userId, sessionId) => {
  const session = await getCheckoutSessionRecord(userId, sessionId);

  if (session.provider !== "simulation") {
    throw new HttpError(400, "Cette session ne peut pas etre finalisee localement.");
  }

  if (session.checkout_state === "completed") {
    return {
      checkoutSession: serializeCheckoutSession(session),
      currentUser: await getUserAccountProfile(userId),
    };
  }

  const plan = getLokifyPlanById(session.lokify_plan_id);

  if (!plan) {
    throw new HttpError(500, "La formule de la session test est introuvable.");
  }

  await activateLokifySubscription({
    userId,
    plan,
    checkoutSessionId: sessionId,
  });

  await updateCheckoutState({
    sessionId,
    checkoutState: "completed",
    completedAt: new Date().toISOString(),
  });

  const refreshedSession = await getCheckoutSessionRecord(userId, sessionId);

  return {
    checkoutSession: serializeCheckoutSession(refreshedSession),
    currentUser: await getUserAccountProfile(userId),
  };
};

export const cancelLokifyCheckoutSession = async (userId, sessionId) => {
  await getCheckoutSessionRecord(userId, sessionId);
  await updateCheckoutState({ sessionId, checkoutState: "canceled" });
};

export const cancelLokifyRenewalAtPeriodEnd = async (userId) => {
  await ensureUserSettingsRecords(userId);

  const { rows } = await query(
    `
      SELECT
        lokify_subscription_status,
        lokify_subscription_end_at,
        cancel_at_period_end
      FROM lokify_billing_settings
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );
  const currentBilling = rows[0];

  if (!currentBilling) {
    throw new HttpError(404, "Abonnement introuvable.");
  }

  if (!["active", "trial"].includes(currentBilling.lokify_subscription_status)) {
    throw new HttpError(400, "Aucun abonnement renouvelable a annuler.");
  }

  if (currentBilling.cancel_at_period_end) {
    return {
      currentUser: await getUserAccountProfile(userId),
    };
  }

  await query(
    `
      UPDATE lokify_billing_settings
      SET cancel_at_period_end = TRUE,
          renewal_canceled_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId]
  );

  return {
    currentUser: await getUserAccountProfile(userId),
  };
};

export const handleStripeWebhook = async (rawBodyBuffer, signatureHeader) => {
  const checkoutConfig = await resolveCheckoutProvider();
  const event = verifyStripeWebhookSignature(
    rawBodyBuffer,
    signatureHeader,
    checkoutConfig.stripe.webhookSecret
  );
  const shouldProcessEvent = await recordProcessedWebhookEvent(event.id, event.type);

  if (!shouldProcessEvent) {
    return { received: true, duplicated: true };
  }

  if (event.type === "checkout.session.completed") {
    const sessionObject = event.data?.object;
    const sessionId = sessionObject?.id;
    const userId = sessionObject?.metadata?.userId || sessionObject?.client_reference_id;
    const stripeSubscriptionId =
      typeof sessionObject?.subscription === "string"
        ? sessionObject.subscription
        : sessionObject?.subscription?.id;

    if (userId && sessionId && stripeSubscriptionId) {
      const plan =
        getLokifyPlanById(sessionObject.metadata?.planId) || lokifyPlanCatalog[0];

      await upsertCheckoutSessionRecord({
        userId,
        sessionId,
        provider: "stripe",
        plan,
        checkoutState: "pending",
        expiresAt: sessionObject.expires_at
          ? new Date(sessionObject.expires_at * 1000).toISOString()
          : null,
        stripeCustomerId: sessionObject.customer || null,
        stripeSubscriptionId,
        checkoutUrl: sessionObject.url || null,
      });

      const stripeSubscription = await fetchStripeSubscription(
        stripeSubscriptionId,
        checkoutConfig.stripe.secretKey
      );

      await syncStripeSubscriptionStatus({
        userId,
        sessionId,
        stripeSession: sessionObject,
        stripeSubscription,
      });
    }
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data?.object;
    const { rows } = await query(
      `
        SELECT user_id
        FROM lokify_billing_settings
        WHERE lokify_stripe_subscription_id = $1
        LIMIT 1
      `,
      [subscription?.id || ""]
    );
    const linkedUserId = rows[0]?.user_id;

    if (linkedUserId) {
      const plan =
        getLokifyPlanById(subscription.metadata?.planId) || lokifyPlanCatalog[0];
      const status = mapStripeStatusToLokifyStatus(subscription.status);
      const startAt = subscription.current_period_start
        ? new Date(subscription.current_period_start * 1000).toISOString()
        : null;
      const endAt = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;

      await updateLokifyBillingRecord({
        userId: linkedUserId,
        plan,
        status,
        startAt,
        endAt,
        checkoutSessionId: null,
        stripeCustomerId: subscription.customer || null,
        stripeSubscriptionId: subscription.id || null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        renewalCanceledAt: subscription.cancel_at_period_end ? new Date().toISOString() : null,
      });
    }
  }

  return { received: true };
};
