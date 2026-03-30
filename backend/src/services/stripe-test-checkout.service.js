import crypto from "crypto";

import env from "../config/env.js";
import HttpError from "../utils/http-error.js";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

const ensureStripeSecretKey = (secretKey) => {
  if (!secretKey) {
    throw new HttpError(
      503,
      "La configuration de paiement est incomplete. Completez-la pour poursuivre le paiement."
    );
  }
};

const parseStripeResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpError(
      502,
      payload?.error?.message || "Stripe a refuse la requete. Verifiez la configuration saisie."
    );
  }

  return payload;
};

const appendStripeField = (formData, key, value) => {
  if (value === undefined || value === null || value === "") {
    return;
  }

  formData.append(key, String(value));
};

export const createStripeCheckoutSession = async ({
  secretKey,
  user,
  plan,
  existingCustomerId,
  stripePriceId = null,
}) => {
  ensureStripeSecretKey(secretKey);

  const formData = new URLSearchParams();
  const successUrl = `${env.clientUrl}/abonnement?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${env.clientUrl}/abonnement?checkout=cancel`;

  appendStripeField(formData, "mode", "subscription");
  appendStripeField(formData, "success_url", successUrl);
  appendStripeField(formData, "cancel_url", cancelUrl);
  appendStripeField(formData, "client_reference_id", user.id);
  appendStripeField(formData, "line_items[0][quantity]", 1);

  if (stripePriceId) {
    appendStripeField(formData, "line_items[0][price]", stripePriceId);
  } else {
    appendStripeField(formData, "line_items[0][price_data][currency]", plan.currency);
    appendStripeField(formData, "line_items[0][price_data][unit_amount]", plan.unitAmount);
    appendStripeField(
      formData,
      "line_items[0][price_data][product_data][name]",
      `LOKIFY ${plan.name}`
    );
    appendStripeField(
      formData,
      "line_items[0][price_data][product_data][description]",
      plan.description
    );
    appendStripeField(
      formData,
      "line_items[0][price_data][recurring][interval]",
      plan.interval
    );
  }

  appendStripeField(formData, "metadata[userId]", user.id);
  appendStripeField(formData, "metadata[planId]", plan.id);
  appendStripeField(formData, "metadata[planName]", plan.name);
  appendStripeField(formData, "metadata[billingFlow]", "lokify_subscription");

  if (existingCustomerId) {
    appendStripeField(formData, "customer", existingCustomerId);
  } else {
    appendStripeField(formData, "customer_email", user.email);
  }

  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  return parseStripeResponse(response);
};

export const fetchStripeCheckoutSession = async (sessionId, secretKey) => {
  ensureStripeSecretKey(secretKey);

  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  return parseStripeResponse(response);
};

export const fetchStripeSubscription = async (subscriptionId, secretKey) => {
  ensureStripeSecretKey(secretKey);

  const response = await fetch(`${STRIPE_API_BASE}/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  return parseStripeResponse(response);
};

export const verifyStripeWebhookSignature = (rawBodyBuffer, signatureHeader, webhookSecret) => {
  const resolvedWebhookSecret = webhookSecret || env.lokifyStripeTestWebhookSecret;

  if (!resolvedWebhookSecret) {
    throw new HttpError(
      503,
      "Le secret webhook Stripe super admin n'est pas configure. Webhook non activable."
    );
  }

  if (!signatureHeader) {
    throw new HttpError(400, "Signature Stripe absente.");
  }

  const parts = String(signatureHeader)
    .split(",")
    .map((entry) => entry.trim())
    .reduce((accumulator, entry) => {
      const [key, value] = entry.split("=");

      if (!key || !value) {
        return accumulator;
      }

      accumulator[key] = accumulator[key] || [];
      accumulator[key].push(value);
      return accumulator;
    }, {});

  const timestamp = parts.t?.[0];
  const expectedSignatures = parts.v1 || [];

  if (!timestamp || !expectedSignatures.length) {
    throw new HttpError(400, "Signature Stripe invalide.");
  }

  const payloadToSign = `${timestamp}.${rawBodyBuffer.toString("utf8")}`;
  const digest = crypto
    .createHmac("sha256", resolvedWebhookSecret)
    .update(payloadToSign, "utf8")
    .digest("hex");

  const isValidSignature = expectedSignatures.some((signature) => {
    const received = Buffer.from(signature, "hex");
    const expected = Buffer.from(digest, "hex");

    if (received.length !== expected.length) {
      return false;
    }

    return crypto.timingSafeEqual(received, expected);
  });

  if (!isValidSignature) {
    throw new HttpError(400, "Verification de signature Stripe impossible.");
  }

  return JSON.parse(rawBodyBuffer.toString("utf8"));
};
