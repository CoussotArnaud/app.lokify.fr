import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import { loginUser } from "../src/services/auth.service.js";
import {
  createProviderFromAdmin,
  getAdminOverview,
  getProviderForAdmin,
  requestProviderInvitationFromAdmin,
  updateProviderFromAdmin,
} from "../src/services/admin.service.js";
import { requestLokifyPlanChange } from "../src/services/lokify-subscription.service.js";
import { resetPasswordWithToken } from "../src/services/password-reset.service.js";

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

const getSuperAdminId = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE account_role = 'super_admin' ORDER BY created_at ASC LIMIT 1"
  );

  return rows[0].id;
};

const getDemoProviderId = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE account_role = 'provider' ORDER BY created_at ASC LIMIT 1"
  );

  return rows[0].id;
};

test("admin detail exposes enriched provider fields and allows clearing optional contact data", async () => {
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const firstSiret = createValidSiret("6234567890000");
  const updatedSiret = createValidSiret("7234567890000");
  const createdProvider = await createProviderFromAdmin({
    company_name: "Studio Atlas",
    siret: firstSiret,
    email: `atlas.${uniqueToken}@example.com`,
    first_name: "Alice",
    last_name: "Bernard",
    phone: "06 01 02 03 04",
    country: "France",
    address: "12 rue des Tests",
    postal_code: "75001",
    city: "Paris",
    billing: {
      planId: "pro",
      subscriptionStatus: "active",
      subscriptionStartAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      subscriptionEndAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    },
    payments: {
      paymentStatus: "paid",
      lastPaymentAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      nextPaymentDueAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
      paymentMethodLabel: "Carte Mastercard se terminant par 4444",
    },
  });

  assert.equal(createdProvider.phone, "06 01 02 03 04");
  assert.equal(createdProvider.company_name, "Studio Atlas");
  assert.equal(createdProvider.siret, firstSiret);
  assert.equal(createdProvider.provider_status, "invited");
  assert.equal(createdProvider.payments.customerPaymentStatus, "paid");

  await updateProviderFromAdmin(createdProvider.id, {
    phone: "",
    city: "Lille",
    siret: updatedSiret,
  });

  await updateProviderFromAdmin(createdProvider.id, {
    billing: {
      planId: "premium",
      subscriptionStatus: "past_due",
      subscriptionEndAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: true,
    },
    payments: {
      paymentStatus: "overdue",
      nextPaymentDueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      paymentMethodLabel: "Virement manuel support",
    },
  });

  const detailedProvider = await getProviderForAdmin(createdProvider.id);

  assert.equal(detailedProvider.first_name, "Alice");
  assert.equal(detailedProvider.last_name, "Bernard");
  assert.equal(detailedProvider.company_name, "Studio Atlas");
  assert.equal(detailedProvider.siret, updatedSiret);
  assert.equal(detailedProvider.phone, null);
  assert.equal(detailedProvider.city, "Lille");
  assert.equal(detailedProvider.subscription.lokifyPlanName, "Avancee");
  assert.equal(detailedProvider.subscription.lokifySubscriptionStatus, "past_due");
  assert.equal(detailedProvider.subscription.cancelAtPeriodEnd, true);
  assert.equal(detailedProvider.payments.customerPaymentStatus, "overdue");
  assert.match(
    detailedProvider.payments.customerPaymentMethodLabel,
    /virement manuel support/i
  );
});

test("admin billing correction updates the provider subscription state", async () => {
  const providerId = await getDemoProviderId();

  await requestLokifyPlanChange(providerId, "essential");
  await updateProviderFromAdmin(providerId, {
    billing: {
      planId: "essential",
      subscriptionStatus: "active",
      subscriptionStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      subscriptionEndAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
    },
  });

  const detailedProvider = await getProviderForAdmin(providerId);

  assert.equal(detailedProvider.subscription.lokifyPlanName, "Basique");
  assert.equal(detailedProvider.subscription.lokifySubscriptionStatus, "active");
  assert.equal(detailedProvider.subscription.cancelAtPeriodEnd, false);
});

test("super admin invitation activates the invited account and finalizes the login password", async () => {
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const superAdminId = await getSuperAdminId();
  const siret = createValidSiret("8234567890000");
  const createdProvider = await createProviderFromAdmin({
    company_name: "Prestataire Reset",
    siret,
    email: `reset.${uniqueToken}@example.com`,
  });
  assert.equal(createdProvider.provider_status, "invited");

  const invitationRequest = await requestProviderInvitationFromAdmin(
    createdProvider.id,
    superAdminId
  );

  assert.equal(invitationRequest.deliveryMode, "log");
  assert.equal(invitationRequest.purpose, "activation");

  const outboxPayload = JSON.parse(
    await fs.readFile(invitationRequest.deliveryReference, "utf8")
  );
  const tokenMatch = String(outboxPayload.text || "").match(/token=([a-f0-9]+)/i);

  assert.ok(tokenMatch?.[1]);

  await resetPasswordWithToken({
    token: tokenMatch[1],
    password: "nouveau12",
  });

  const detailedProvider = await getProviderForAdmin(createdProvider.id);
  assert.equal(detailedProvider.provider_status, "active");
  assert.ok(detailedProvider.security.lastPasswordResetRequestedAt);
  assert.ok(detailedProvider.security.lastInvitationSentAt);

  const loginResponse = await loginUser({
    email: createdProvider.email,
    password: "nouveau12",
  });

  assert.equal(loginResponse.user.email, createdProvider.email);
});

test("super admin overview exposes business revenue indicators", async () => {
  const overview = await getAdminOverview();

  assert.equal(typeof overview.metrics.lokifyMonthlyRevenue, "number");
  assert.equal(typeof overview.metrics.lokifyAnnualRevenue, "number");
  assert.equal(typeof overview.metrics.activeProvidersCurrently, "number");
  assert.equal(typeof overview.metrics.invitedProviders, "number");
});

test("provider detail exposes read-only business metrics", async () => {
  const providerId = await getDemoProviderId();
  const detailedProvider = await getProviderForAdmin(providerId);

  assert.equal(detailedProvider.business.monthlyRevenue, 290);
  assert.equal(detailedProvider.business.totalRevenue, 290);
  assert.equal(detailedProvider.business.totalReservations, 2);
  assert.equal(detailedProvider.business.confirmedReservations, 1);
});
