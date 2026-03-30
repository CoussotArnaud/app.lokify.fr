import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import env from "../src/config/env.js";
import { query } from "../src/config/db.js";
import { registerUser, loginUser, getCurrentUser } from "../src/services/auth.service.js";
import {
  cancelLokifyRenewalAtPeriodEnd,
  completeSimulationCheckoutSession,
  createLokifyCheckoutSession,
  getLokifyBillingOverview,
  requestLokifyPlanChange,
  submitLokifySubscriptionContactRequest,
} from "../src/services/lokify-subscription.service.js";
import { createStripeCheckoutSession } from "../src/services/stripe-test-checkout.service.js";
import {
  getCustomerPaymentSettings,
  updateCustomerPaymentSettings,
} from "../src/services/customer-payments.service.js";
import { resetInseeSireneTokenCacheForTests } from "../src/services/insee-sirene.service.js";

env.inseeClientId = "";
env.inseeClientSecret = "";

const createValidSiret = (seed) => {
  const base = String(seed || "")
    .replace(/\D/g, "")
    .padEnd(13, "0")
    .slice(0, 13);

  for (let lastDigit = 0; lastDigit <= 9; lastDigit += 1) {
    const candidate = `${base}${lastDigit}`;
    let sum = 0;
    let shouldDouble = false;

    for (let index = candidate.length - 1; index >= 0; index -= 1) {
      let digit = Number(candidate[index]);

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    if (sum % 10 === 0) {
      return candidate;
    }
  }

  throw new Error("Impossible de generer un SIRET de test.");
};

test("super admin login exposes admin permissions and no provider workspace access", async () => {
  const response = await loginUser({
    email: "team@lokify.fr",
    password: "admin",
  });

  assert.equal(response.user.account_role, "super_admin");
  assert.equal(response.user.permissions.canAccessAdminInterface, true);
  assert.equal(response.user.permissions.canManageProviders, true);
  assert.equal(response.user.permissions.canAccessBilling, false);
  assert.equal(response.user.permissions.canAccessOperationalModules, false);
});

test("super admin login recreates the official account when it is missing from the configured email", async () => {
  const previousEmail = `legacy.${crypto.randomUUID().slice(0, 8)}@lokify.fr`;

  await query("UPDATE users SET email = $1 WHERE email = $2", [
    previousEmail,
    env.lokifySuperAdminEmail,
  ]);

  try {
    const response = await loginUser({
      email: env.lokifySuperAdminEmail,
      password: env.lokifySuperAdminPassword,
    });
    const { rows } = await query(
      `
        SELECT email, account_role
        FROM users
        WHERE email = $1
      `,
      [env.lokifySuperAdminEmail]
    );

    assert.equal(response.user.account_role, "super_admin");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_role, "super_admin");
  } finally {
    await query("DELETE FROM users WHERE email = $1", [env.lokifySuperAdminEmail]);
    await query("UPDATE users SET email = $1 WHERE email = $2", [
      env.lokifySuperAdminEmail,
      previousEmail,
    ]);
  }
});

test("provider registration creates an isolated locked SaaS account", async () => {
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const response = await registerUser({
    first_name: "Paul",
    last_name: "Durand",
    company_name: "Prestataire Test",
    siret: createValidSiret("1234567890000"),
    email: `provider.${uniqueToken}@example.com`,
    password: "secret12",
  });

  assert.equal(response.user.account_role, "provider");
  assert.equal(response.user.company_name, "Prestataire Test");
  assert.equal(response.user.permissions.canAccessAdminInterface, false);
  assert.equal(response.user.permissions.canAccessOperationalModules, false);
  assert.equal(response.user.lokifyBilling.lokifySubscriptionStatus, "inactive");
});

test("provider registration rejects an invalid siret", async () => {
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const validSiret = createValidSiret("2234567890000");
  const invalidSiret = `${validSiret.slice(0, 13)}${(Number(validSiret[13]) + 1) % 10}`;

  await assert.rejects(
    () =>
      registerUser({
        first_name: "Lina",
        last_name: "Thomas",
        company_name: "Studio Test",
        siret: invalidSiret,
        email: `invalid-siret.${uniqueToken}@example.com`,
        password: "secret12",
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /siret/i);
      return true;
    }
  );
});

test("provider registration stores Sirene-enriched company fields when Insee is configured", async () => {
  const originalFetch = global.fetch;
  env.inseeClientId = "insee-client-id";
  env.inseeClientSecret = "insee-client-secret";
  env.inseeApiBaseUrl = "https://api.insee.test/api-sirene/3.11";
  env.inseeTokenUrl = "https://api.insee.test/token";
  resetInseeSireneTokenCacheForTests();
  let callIndex = 0;

  global.fetch = async () => {
    callIndex += 1;

    if (callIndex === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "token-register",
          expires_in: 3600,
        }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        etablissement: {
          siren: "623456789",
          numeroVoieEtablissement: "18",
          typeVoieEtablissement: "avenue",
          libelleVoieEtablissement: "des Arts",
          codePostalEtablissement: "69006",
          libelleCommuneEtablissement: "Lyon",
          activitePrincipaleEtablissement: "7729Z",
          etatAdministratifEtablissement: "A",
          enseigne1Etablissement: "Studio Lokify",
          uniteLegale: {
            denominationUniteLegale: "Atelier Horizon",
          },
        },
      }),
    };
  };

  try {
    const uniqueToken = crypto.randomUUID().slice(0, 8);
    const response = await registerUser({
      first_name: "Marie",
      last_name: "Durand",
      company_name: "Atelier Horizon",
      siret: "62345678900006",
      email: `sirene.${uniqueToken}@example.com`,
      password: "secret12",
    });

    assert.equal(response.user.sirene_verification_status, "verified");
    assert.equal(response.user.siren, "623456789");
    assert.equal(response.user.address, "18 avenue des Arts");
    assert.equal(response.user.postal_code, "69006");
    assert.equal(response.user.city, "Lyon");
    assert.equal(response.user.ape_code, "7729Z");
  } finally {
    env.inseeClientId = "";
    env.inseeClientSecret = "";
    resetInseeSireneTokenCacheForTests();
    global.fetch = originalFetch;
  }
});

test("simulation checkout activates provider access and cancellation keeps access until period end", async () => {
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const registration = await registerUser({
    first_name: "Julie",
    last_name: "Marchand",
    company_name: "Prestataire Checkout",
    siret: createValidSiret("3234567890000"),
    email: `checkout.${uniqueToken}@example.com`,
    password: "secret12",
  });

  const checkoutResponse = await createLokifyCheckoutSession(registration.user, "pro");

  await completeSimulationCheckoutSession(registration.user.id, checkoutResponse.sessionId);
  const cancellationResponse = await cancelLokifyRenewalAtPeriodEnd(registration.user.id);

  assert.equal(cancellationResponse.currentUser.lokifyBilling.cancelAtPeriodEnd, true);
  assert.equal(
    cancellationResponse.currentUser.permissions.canAccessOperationalModules,
    true
  );
});

test("billing overview exposes SaaS payment status and recent plan change activity", async () => {
  const loginResponse = await loginUser({
    email: "presta@lokify.fr",
    password: "presta",
  });

  const checkoutResponse = await createLokifyCheckoutSession(loginResponse.user, "premium");
  await completeSimulationCheckoutSession(loginResponse.user.id, checkoutResponse.sessionId);

  const overview = await getLokifyBillingOverview(loginResponse.user.id);

  assert.equal(overview.lokifySubscription.lokifyPlanId, "premium");
  assert.equal(overview.lokifyPayment.status, "paid");
  assert.ok(Array.isArray(overview.recentCheckoutSessions));
  assert.ok(
    overview.recentCheckoutSessions.some(
      (session) => session.sessionId === checkoutResponse.sessionId && session.checkoutState === "completed"
    )
  );
});

test("provider can request a plan change without activating Stripe checkout", async () => {
  const loginResponse = await loginUser({
    email: "presta@lokify.fr",
    password: "presta",
  });

  const result = await requestLokifyPlanChange(loginResponse.user.id, "essential");
  const overview = await getLokifyBillingOverview(loginResponse.user.id);

  assert.equal(result.currentUser.lokifyBilling.planChangeRequest.requestedPlanId, "essential");
  assert.equal(overview.lokifySubscription.planChangeRequest.requestedPlanName, "Basique");
  assert.equal(overview.lokifySubscription.saasLifecycleStatus, "active");
});

test("provider can send a subscription contact request that also opens a billing ticket", async () => {
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const registration = await registerUser({
    first_name: "Camille",
    last_name: "Martin",
    company_name: "Studio Horizon",
    siret: createValidSiret("4234567890000"),
    email: `subscription.${uniqueToken}@example.com`,
    password: "secret12",
  });

  const result = await submitLokifySubscriptionContactRequest(registration.user, {
    planId: "premium",
    firstName: "Camille",
    lastName: "Martin",
    company: "Studio Horizon",
    email: `subscription.${uniqueToken}@example.com`,
    phone: "0601020304",
    message: "Je souhaite etre rappele pour mettre en place Lokify.",
  });

  const overview = await getLokifyBillingOverview(registration.user.id);
  const { rows } = await query(
    `
      SELECT subject, category
      FROM support_tickets
      WHERE provider_user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [registration.user.id]
  );

  assert.equal(result.requestedPlan.id, "premium");
  assert.equal(overview.lokifySubscription.planChangeRequest.requestedPlanId, "premium");
  assert.equal(rows[0].category, "billing");
  assert.match(rows[0].subject, /Demande abonnement/i);
  assert.ok(result.supportTicket?.reference);
});

test("checkout session reuses a pending attempt and blocks the already active plan", async () => {
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const registration = await registerUser({
    first_name: "Nathan",
    last_name: "Leroy",
    company_name: "Prestataire Abonnement",
    siret: createValidSiret("5234567890000"),
    email: `billing.${uniqueToken}@example.com`,
    password: "secret12",
  });

  const firstCheckout = await createLokifyCheckoutSession(registration.user, "pro");
  const secondCheckout = await createLokifyCheckoutSession(registration.user, "pro");

  assert.equal(secondCheckout.sessionId, firstCheckout.sessionId);

  await completeSimulationCheckoutSession(registration.user.id, firstCheckout.sessionId);

  await assert.rejects(
    () => createLokifyCheckoutSession(registration.user, "pro"),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /deja active/i);
      return true;
    }
  );
});

test("stripe checkout payload reuses the customer id without resending customer_email", async () => {
  const originalFetch = global.fetch;
  let capturedBody = "";

  global.fetch = async (_url, options = {}) => {
    capturedBody = String(options.body || "");

    return {
      ok: true,
      json: async () => ({
        id: "cs_test_123",
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
        customer: "cus_existing_123",
        expires_at: Math.floor(Date.now() / 1000) + 900,
      }),
    };
  };

  try {
    await createStripeCheckoutSession({
      secretKey: "sk_test_123",
      user: {
        id: "provider-test",
        email: "provider@example.com",
      },
      plan: {
        id: "pro",
        name: "Intermediaire",
        description: "Formule Pro",
        currency: "eur",
        unitAmount: 5900,
        interval: "month",
      },
      existingCustomerId: "cus_existing_123",
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(capturedBody, /customer=cus_existing_123/);
  assert.doesNotMatch(capturedBody, /customer_email=/);
});

test("provider Stripe secrets are stored server-side and returned masked", async () => {
  const providerLogin = await loginUser({
      email: "presta@lokify.fr",
      password: "presta",
  });

  await updateCustomerPaymentSettings(providerLogin.user.id, {
    customerPaymentsEnabled: true,
    publishableKey: "pk_test_1234567890",
    secretKey: "sk_test_1234567890",
    webhookSecret: "whsec_1234567890",
    accountId: "acct_test_1234",
  });

  const settings = await getCustomerPaymentSettings(providerLogin.user.id);
  const { rows } = await query(
    `
      SELECT
        customer_stripe_publishable_key,
        customer_stripe_secret_key_encrypted,
        customer_stripe_webhook_secret_encrypted
      FROM customer_payment_settings
      WHERE user_id = $1
    `,
    [providerLogin.user.id]
  );

  assert.equal(settings.customerPayments.customerPaymentsEnabled, true);
  assert.equal(settings.customerPayments.customerStripePublishableKeyConfigured, true);
  assert.equal(settings.customerPayments.customerStripeSecretKeyConfigured, true);
  assert.match(settings.customerPayments.customerStripePublishableKeyPreview, /pk_test_/i);
  assert.match(settings.customerPayments.customerStripeSecretKeyPreview, /sk_test_/i);
  assert.equal(rows[0].customer_stripe_publishable_key, "pk_test_1234567890");
  assert.notEqual(rows[0].customer_stripe_secret_key_encrypted, "sk_test_1234567890");
  assert.notEqual(rows[0].customer_stripe_webhook_secret_encrypted, "whsec_1234567890");
});

test("getCurrentUser rejects stale sessions cleanly when the user no longer exists", async () => {
  await assert.rejects(
    () =>
      getCurrentUser(crypto.randomUUID(), {
        sessionProfile: "standard",
        displayEmail: "obsolete-session@lokify.fr",
      }),
    (error) => {
      assert.equal(error.statusCode, 404);
      assert.match(error.message, /utilisateur introuvable/i);
      return true;
    }
  );
});
