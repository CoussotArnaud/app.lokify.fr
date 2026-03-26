import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import { loginUser } from "../src/services/auth.service.js";
import {
  createProviderFromAdmin,
  getProviderForAdmin,
  requestProviderPasswordResetFromAdmin,
  updateProviderFromAdmin,
} from "../src/services/admin.service.js";
import { resetPasswordWithToken } from "../src/services/password-reset.service.js";

const getSuperAdminId = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE account_role = 'super_admin' ORDER BY created_at ASC LIMIT 1"
  );

  return rows[0].id;
};

test("admin detail exposes enriched provider fields and allows clearing optional contact data", async () => {
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const createdProvider = await createProviderFromAdmin({
    full_name: "Studio Atlas",
    email: `atlas.${uniqueToken}@example.com`,
    password: "secret12",
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
  assert.equal(createdProvider.payments.customerPaymentStatus, "paid");

  await updateProviderFromAdmin(createdProvider.id, {
    phone: "",
    city: "Lille",
  });

  const detailedProvider = await getProviderForAdmin(createdProvider.id);

  assert.equal(detailedProvider.first_name, "Alice");
  assert.equal(detailedProvider.last_name, "Bernard");
  assert.equal(detailedProvider.phone, null);
  assert.equal(detailedProvider.city, "Lille");
  assert.equal(detailedProvider.subscription.lokifyPlanName, "Pro");
  assert.equal(detailedProvider.payments.customerPaymentStatus, "paid");
  assert.match(
    detailedProvider.payments.customerPaymentMethodLabel,
    /mastercard/i
  );
});

test("super admin password reset keeps the flow secure and updates the login password", async () => {
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const superAdminId = await getSuperAdminId();
  const createdProvider = await createProviderFromAdmin({
    full_name: "Prestataire Reset",
    email: `reset.${uniqueToken}@example.com`,
    password: "secret12",
  });

  const resetRequest = await requestProviderPasswordResetFromAdmin(
    createdProvider.id,
    superAdminId
  );

  assert.equal(resetRequest.deliveryMode, "log");

  const outboxPayload = JSON.parse(
    await fs.readFile(resetRequest.deliveryReference, "utf8")
  );
  const tokenMatch = String(outboxPayload.text || "").match(/token=([a-f0-9]+)/i);

  assert.ok(tokenMatch?.[1]);

  await resetPasswordWithToken({
    token: tokenMatch[1],
    password: "nouveau12",
  });

  const detailedProvider = await getProviderForAdmin(createdProvider.id);
  assert.ok(detailedProvider.security.lastPasswordResetRequestedAt);

  const loginResponse = await loginUser({
    email: createdProvider.email,
    password: "nouveau12",
  });

  assert.equal(loginResponse.user.email, createdProvider.email);

  await assert.rejects(
    () =>
      loginUser({
        email: createdProvider.email,
        password: "secret12",
      }),
    (error) => {
      assert.equal(error.statusCode, 401);
      return true;
    }
  );
});

