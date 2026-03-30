import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import {
  completeReservationDeparture,
  completeReservationReturn,
  generateMissingProductUnits,
  getOperationsOverview,
  updateProductUnit,
} from "../src/services/operations.service.js";
import { createReservation } from "../src/services/reservations.service.js";

const getDemoUserId = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE account_role = 'provider' ORDER BY created_at ASC LIMIT 1"
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

const getItemIdByName = async (userId, name) => {
  const { rows } = await query(
    "SELECT id FROM items WHERE user_id = $1 AND name = $2 LIMIT 1",
    [userId, name]
  );

  return rows[0].id;
};

test("departure and return operations update tracked units and stock journal", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const photoboothId = await getItemIdByName(userId, "Photobooth Premium");
  const startDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);

  const reservation = await createReservation(userId, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "confirmed",
    notes: "Operation stock test",
    lines: [{ item_id: photoboothId, quantity: 2 }],
  });

  const departure = await completeReservationDeparture(userId, reservation.id, {
    notes: "Depart terrain test",
  });

  assert.equal(departure.status, "completed");

  const afterDeparture = await getOperationsOverview(userId);
  const checkedOutUnits = afterDeparture.productUnits.filter(
    (unit) => unit.item_id === photoboothId && unit.status === "out"
  );
  const departureMovements = afterDeparture.stockMovements.filter(
    (movement) =>
      movement.reservation_id === reservation.id && movement.movement_type === "departure"
  );

  assert.equal(checkedOutUnits.length, 2);
  assert.equal(departureMovements.length, 2);

  const reservationReturn = await completeReservationReturn(userId, reservation.id, {
    notes: "Retour terrain test",
  });

  assert.equal(reservationReturn.status, "completed");

  const afterReturn = await getOperationsOverview(userId);
  const availableUnits = afterReturn.productUnits.filter(
    (unit) => unit.item_id === photoboothId && unit.status === "available"
  );
  const returnMovements = afterReturn.stockMovements.filter(
    (movement) => movement.reservation_id === reservation.id && movement.movement_type === "return"
  );

  assert.equal(availableUnits.length >= 2, true);
  assert.equal(returnMovements.length, 2);

  const updatedUnit = await updateProductUnit(userId, availableUnits[0].id, {
    status: "maintenance",
    condition_notes: "Controle atelier",
    last_known_location: "Atelier Lyon",
  });

  assert.equal(updatedUnit.status, "maintenance");

  const afterStatusUpdate = await getOperationsOverview(userId);
  assert.equal(
    afterStatusUpdate.stockMovements.some(
      (movement) =>
        movement.product_unit_id === availableUnits[0].id &&
        movement.movement_type === "availability_change"
    ),
    true
  );
});

test("generateMissingProductUnits creates tracked units up to the declared stock", async () => {
  const userId = await getDemoUserId();
  const itemId = crypto.randomUUID();
  const uniqueSuffix = crypto.randomUUID().slice(0, 6);

  await query(
    `
      INSERT INTO items (id, user_id, name, category, stock, status, price, deposit)
      VALUES ($1, $2, $3, 'Vehicule', 3, 'available', 120, 900)
    `,
    [itemId, userId, `Voiture test ${uniqueSuffix}`]
  );

  await query(
    `
      INSERT INTO item_profiles (
        item_id,
        user_id,
        vat,
        serial_tracking,
        category_slug,
        category_name,
        online_visible,
        public_name,
        public_description,
        catalog_mode,
        sku
      )
      VALUES ($1, $2, 20, TRUE, 'vehicule', 'Vehicule', FALSE, $3, 'Modele de test', 'location', $4)
    `,
    [itemId, userId, `Voiture test ${uniqueSuffix}`, `REF-TEST-${uniqueSuffix.toUpperCase()}`]
  );

  const units = await generateMissingProductUnits(userId, itemId);

  assert.equal(units.length, 3);
  assert.equal(units.every((unit) => unit.status === "available"), true);

  const overview = await getOperationsOverview(userId);
  assert.equal(
    overview.stockMovements.filter(
      (movement) => movement.item_id === itemId && movement.movement_type === "unit_created"
    ).length,
    3
  );
});
