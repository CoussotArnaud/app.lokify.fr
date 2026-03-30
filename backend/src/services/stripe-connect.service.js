import HttpError from "../utils/http-error.js";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

const ensureStripeSecretKey = (secretKey) => {
  if (!secretKey) {
    throw new HttpError(
      503,
      "La connexion Stripe n'est pas disponible pour le moment. Verifiez la configuration plateforme."
    );
  }
};

const appendStripeField = (formData, key, value) => {
  if (value === undefined || value === null || value === "") {
    return;
  }

  formData.append(key, String(value));
};

const appendStripeMetadata = (formData, metadata = {}) => {
  Object.entries(metadata || {}).forEach(([key, value]) => {
    appendStripeField(formData, `metadata[${key}]`, value);
  });
};

const parseStripeResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpError(
      response.status === 404 ? 404 : 502,
      payload?.error?.message || "Stripe a refuse la requete."
    );
  }

  return payload;
};

const createStripeRequestHeaders = (secretKey, stripeAccount = null) => {
  const headers = {
    Authorization: `Bearer ${secretKey}`,
  };

  if (stripeAccount) {
    headers["Stripe-Account"] = stripeAccount;
  }

  return headers;
};

export const retrieveConnectAccount = async ({ secretKey, accountId }) => {
  ensureStripeSecretKey(secretKey);

  const response = await fetch(`${STRIPE_API_BASE}/accounts/${encodeURIComponent(accountId)}`, {
    headers: createStripeRequestHeaders(secretKey),
  });

  return parseStripeResponse(response);
};

export const createConnectExpressAccount = async ({
  secretKey,
  email,
  country = "FR",
  metadata = {},
} = {}) => {
  ensureStripeSecretKey(secretKey);

  const formData = new URLSearchParams();
  appendStripeField(formData, "type", "express");
  appendStripeField(formData, "country", String(country || "FR").trim().toUpperCase());
  appendStripeField(formData, "email", email);
  appendStripeField(formData, "capabilities[card_payments][requested]", true);
  appendStripeField(formData, "capabilities[transfers][requested]", true);
  appendStripeMetadata(formData, metadata);

  const response = await fetch(`${STRIPE_API_BASE}/accounts`, {
    method: "POST",
    headers: {
      ...createStripeRequestHeaders(secretKey),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  return parseStripeResponse(response);
};

export const createConnectAccountOnboardingLink = async ({
  secretKey,
  accountId,
  refreshUrl,
  returnUrl,
} = {}) => {
  ensureStripeSecretKey(secretKey);

  const formData = new URLSearchParams();
  appendStripeField(formData, "account", accountId);
  appendStripeField(formData, "refresh_url", refreshUrl);
  appendStripeField(formData, "return_url", returnUrl);
  appendStripeField(formData, "type", "account_onboarding");

  const response = await fetch(`${STRIPE_API_BASE}/account_links`, {
    method: "POST",
    headers: {
      ...createStripeRequestHeaders(secretKey),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  return parseStripeResponse(response);
};

export const createConnectedAccountCheckoutSession = async ({
  secretKey,
  accountId,
  successUrl,
  cancelUrl,
  customerEmail,
  amountCents,
  lineItemName,
  lineItemDescription,
  metadata = {},
} = {}) => {
  ensureStripeSecretKey(secretKey);

  if (!accountId) {
    throw new HttpError(400, "Compte Stripe prestataire introuvable.");
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new HttpError(400, "Le montant a encaisser est invalide.");
  }

  const formData = new URLSearchParams();
  appendStripeField(formData, "mode", "payment");
  appendStripeField(formData, "success_url", successUrl);
  appendStripeField(formData, "cancel_url", cancelUrl);
  appendStripeField(formData, "locale", "fr");
  appendStripeField(formData, "billing_address_collection", "required");
  appendStripeField(formData, "phone_number_collection[enabled]", true);
  appendStripeField(formData, "line_items[0][quantity]", 1);
  appendStripeField(formData, "line_items[0][price_data][currency]", "eur");
  appendStripeField(formData, "line_items[0][price_data][unit_amount]", amountCents);
  appendStripeField(
    formData,
    "line_items[0][price_data][product_data][name]",
    lineItemName || "Reservation boutique en ligne"
  );
  appendStripeField(
    formData,
    "line_items[0][price_data][product_data][description]",
    lineItemDescription
  );
  appendStripeField(formData, "customer_email", customerEmail);
  appendStripeMetadata(formData, metadata);

  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      ...createStripeRequestHeaders(secretKey, accountId),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  return parseStripeResponse(response);
};

export const retrieveConnectedAccountCheckoutSession = async ({
  secretKey,
  accountId,
  sessionId,
} = {}) => {
  ensureStripeSecretKey(secretKey);

  if (!accountId) {
    throw new HttpError(400, "Compte Stripe prestataire introuvable.");
  }

  const response = await fetch(
    `${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: createStripeRequestHeaders(secretKey, accountId),
    }
  );

  return parseStripeResponse(response);
};
