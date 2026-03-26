import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import { registerUser, loginUser } from "../src/services/auth.service.js";
import {
  cancelLokifyRenewalAtPeriodEnd,
  completeSimulationCheckoutSession,
  createLokifyCheckoutSession,
} from "../src/services/lokify-subscription.service.js";
import {
  getCustomerPaymentSettings,
  updateCustomerPaymentSettings,
} from "../src/services/customer-payments.service.js";

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

test("provider registration creates an isolated locked SaaS account", async () => {
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const response = await registerUser({
    full_name: "Prestataire Test",
    email: `provider.${uniqueToken}@example.com`,
    password: "secret12",
  });

  assert.equal(response.user.account_role, "provider");
  assert.equal(response.user.permissions.canAccessAdminInterface, false);
  assert.equal(response.user.permissions.canAccessOperationalModules, false);
  assert.equal(response.user.lokifyBilling.lokifySubscriptionStatus, "inactive");
});

test("simulation checkout activates provider access and cancellation keeps access until period end", async () => {
  const loginResponse = await loginUser({
      email: "presta@lokify.fr",
      password: "presta",
  });

  const checkoutResponse = await createLokifyCheckoutSession(loginResponse.user, "pro");

  await completeSimulationCheckoutSession(loginResponse.user.id, checkoutResponse.sessionId);
  const cancellationResponse = await cancelLokifyRenewalAtPeriodEnd(loginResponse.user.id);

  assert.equal(cancellationResponse.currentUser.lokifyBilling.cancelAtPeriodEnd, true);
  assert.equal(
    cancellationResponse.currentUser.permissions.canAccessOperationalModules,
    true
  );
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
