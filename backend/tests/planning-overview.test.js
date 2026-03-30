import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import { createDeliveryTour } from "../src/services/deliveries.service.js";
import { getPlanning } from "../src/services/planning.service.js";
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

const getPlanningItem = async (userId) => {
  const { rows } = await query(
    `
      SELECT id, stock
      FROM items
      WHERE user_id = $1
        AND stock >= 2
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [userId]
  );

  return rows[0];
};

test("getPlanning returns V2 reservations, deliveries and availability", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const item = await getPlanningItem(userId);
  const uniqueSuffix = crypto.randomUUID();
  const startDate = new Date(Date.now() + (220 + Math.floor(Math.random() * 60)) * 24 * 60 * 60 * 1000);
  startDate.setHours(10, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);

  const reservation = await createReservation(userId, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "confirmed",
    notes: `Planning overview ${uniqueSuffix}`,
    lines: [{ item_id: item.id, quantity: 2 }],
  });

  const tour = await createDeliveryTour(userId, {
    name: `Tournee planning ${uniqueSuffix}`,
    driver: "Equipe planning",
    area: "Paris centre",
    date: startDate.toISOString(),
    assignments: [{ reservation_id: reservation.id, assignment_type: "delivery" }],
  });

  const planning = await getPlanning(userId, {
    start: new Date(startDate.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    end: new Date(endDate.getTime() + 12 * 60 * 60 * 1000).toISOString(),
  });

  assert.ok(planning.statuses.length >= 5);
  assert.ok(planning.metrics.reservations >= 1);
  assert.ok(planning.metrics.deliveries >= 1);

  const plannedReservation = planning.reservations.find((entry) => entry.id === reservation.id);
  assert.ok(plannedReservation);
  assert.equal(plannedReservation.line_count, 1);
  assert.equal(plannedReservation.total_quantity, 2);
  assert.equal(plannedReservation.deliveries.length, 1);

  const plannedTour = planning.deliveries.find((entry) => entry.id === tour.id);
  assert.ok(plannedTour);
  assert.equal(plannedTour.assignments.length, 1);

  const reservationDay = planning.days.find((day) => day.reservation_ids.includes(reservation.id));
  assert.ok(reservationDay);
  assert.ok(reservationDay.summary.reservations >= 1);

  const deliveryDay = planning.days.find((day) => day.delivery_ids.includes(tour.id));
  assert.ok(deliveryDay);
  assert.ok(deliveryDay.summary.deliveries >= 1);

  const itemAvailability = reservationDay.products.find((product) => product.item_id === item.id);
  assert.ok(itemAvailability);
  assert.equal(itemAvailability.reserved_quantity, 2);
  assert.ok(itemAvailability.usable_capacity >= 2);
  assert.equal(
    itemAvailability.available_quantity,
    Math.max(0, itemAvailability.usable_capacity - itemAvailability.reserved_quantity)
  );
});
