import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import { createClient } from "../src/services/clients.service.js";
import { createReservation } from "../src/services/reservations.service.js";

const getDemoUserId = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE account_role = 'provider' ORDER BY created_at ASC LIMIT 1"
  );
  return rows[0].id;
};

const getFirstItemId = async (userId) => {
  const { rows } = await query(
    "SELECT id FROM items WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
    [userId]
  );

  return rows[0].id;
};

const getFirstClientId = async (userId) => {
  const { rows } = await query(
    "SELECT id FROM clients WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
    [userId]
  );

  return rows[0].id;
};

test("createClient normalizes fields and blocks gross duplicates", async () => {
  const userId = await getDemoUserId();
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const createdClient = await createClient(userId, {
    first_name: "  Lea  ",
    last_name: "  Durant ",
    email: `LEA.${uniqueToken}@example.com `,
    phone: "06 11 22 33 44",
  });

  assert.equal(createdClient.first_name, "Lea");
  assert.equal(createdClient.last_name, "Durant");
  assert.equal(createdClient.email, `lea.${uniqueToken}@example.com`);

  await assert.rejects(
    () =>
      createClient(userId, {
        first_name: "Lea",
        last_name: "Durant",
        email: `lea.${uniqueToken}@example.com`,
        phone: "07 99 88 77 66",
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /adresse email/i);
      return true;
    }
  );

  await assert.rejects(
    () =>
      createClient(userId, {
        first_name: "Autre",
        last_name: "Contact",
        email: `autre.${uniqueToken}@example.com`,
        phone: "+33 6 11 22 33 44",
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /numero de telephone/i);
      return true;
    }
  );
});

test("createReservation still works with an existing client", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const itemId = await getFirstItemId(userId);
  const startDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);

  const reservation = await createReservation(userId, {
    client_id: clientId,
    item_id: itemId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "draft",
    notes: "Test existant",
  });

  assert.equal(reservation.client_id, clientId);
  assert.equal(reservation.item_id, itemId);
  assert.match(reservation.client_name, /\S+/);
});

test("createReservation links a freshly created client", async () => {
  const userId = await getDemoUserId();
  const itemId = await getFirstItemId(userId);
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const client = await createClient(userId, {
    first_name: "Nora",
    last_name: "Petit",
    email: `nora.${uniqueToken}@example.com`,
    phone: "06 55 44 33 22",
  });
  const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);

  const reservation = await createReservation(userId, {
    client_id: client.id,
    item_id: itemId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "draft",
    notes: "Test nouveau client",
  });

  assert.equal(reservation.client_id, client.id);
  assert.equal(reservation.item_id, itemId);
  assert.match(reservation.client_name, /Nora Petit/);
});
