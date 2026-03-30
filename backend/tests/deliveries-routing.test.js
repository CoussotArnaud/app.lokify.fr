import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import { createReservation } from "../src/services/reservations.service.js";
import {
  createDeliveryTour,
  deleteDeliveryTour,
  moveDeliveryStop,
  updateDeliveryTour,
} from "../src/services/deliveries.service.js";

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

const getFirstItemId = async (userId) => {
  const { rows } = await query(
    "SELECT id FROM items WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
    [userId]
  );

  return rows[0].id;
};

const createTourReservations = async (userId, count) => {
  const clientId = await getFirstClientId(userId);
  const itemId = await getFirstItemId(userId);
  const baseOffsetDays = 40 + Math.floor(Math.random() * 120);
  const reservations = [];

  for (let index = 0; index < count; index += 1) {
    const startDate = new Date(Date.now() + (baseOffsetDays + index * 3) * 24 * 60 * 60 * 1000);
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    const reservation = await createReservation(userId, {
      client_id: clientId,
      item_id: itemId,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      status: "confirmed",
      notes: `Test livraisons ${crypto.randomUUID()}`,
    });

    reservations.push(reservation);
  }

  return reservations;
};

test("createDeliveryTour persists assignments and stops", async () => {
  const userId = await getDemoUserId();
  const reservations = await createTourReservations(userId, 2);

  const tour = await createDeliveryTour(userId, {
    name: "Tournee validation P2.1",
    driver: "Equipe tests",
    area: "Lyon centre",
    date: reservations[0].start_date,
    assignments: [
      { reservation_id: reservations[0].id, assignment_type: "delivery" },
      { reservation_id: reservations[1].id, assignment_type: "return" },
    ],
  });

  assert.equal(tour.name, "Tournee validation P2.1");
  assert.equal(tour.reservations.length, 2);
  assert.equal(tour.stops.length, 3);
  assert.equal(tour.stops[0].kind, "depot");
  assert.equal(tour.stops[1].assignment_type, "delivery");
  assert.equal(tour.stops[2].assignment_type, "return");
});

test("moveDeliveryStop updates stop order inside a tour", async () => {
  const userId = await getDemoUserId();
  const reservations = await createTourReservations(userId, 2);
  const createdTour = await createDeliveryTour(userId, {
    name: "Tournee reordonnancement P2.1",
    driver: "Equipe ordre",
    area: "Paris ouest",
    date: reservations[0].start_date,
    assignments: [
      { reservation_id: reservations[0].id, assignment_type: "delivery" },
      { reservation_id: reservations[1].id, assignment_type: "return" },
    ],
  });

  const stopToMove = createdTour.stops[createdTour.stops.length - 1];
  const updatedTour = await moveDeliveryStop(userId, createdTour.id, stopToMove.id, "up");
  const movedStopIndex = updatedTour.stops.findIndex((stop) => stop.id === stopToMove.id);

  assert.equal(movedStopIndex, createdTour.stops.length - 2);
});

test("updateDeliveryTour replaces assignments and updates tour details", async () => {
  const userId = await getDemoUserId();
  const reservations = await createTourReservations(userId, 3);
  const createdTour = await createDeliveryTour(userId, {
    name: "Tournee edition P2.1",
    driver: "Equipe edition",
    area: "Bordeaux",
    date: reservations[0].start_date,
    assignments: [
      { reservation_id: reservations[0].id, assignment_type: "delivery" },
      { reservation_id: reservations[1].id, assignment_type: "return" },
    ],
  });

  const updatedTour = await updateDeliveryTour(userId, createdTour.id, {
    name: "Tournee edition P2.1 maj",
    driver: "Equipe edition B",
    area: "Bordeaux centre",
    date: reservations[2].start_date,
    assignments: [{ reservation_id: reservations[2].id, assignment_type: "delivery" }],
  });

  assert.equal(updatedTour.name, "Tournee edition P2.1 maj");
  assert.equal(updatedTour.driver, "Equipe edition B");
  assert.equal(updatedTour.area, "Bordeaux centre");
  assert.equal(updatedTour.reservations.length, 1);
  assert.equal(updatedTour.reservations[0].reservation_id, reservations[2].id);
  assert.equal(updatedTour.stops.length, 2);
  assert.equal(updatedTour.stops[1].reservation_id, reservations[2].id);
});

test("deleteDeliveryTour removes the tour and its assignments", async () => {
  const userId = await getDemoUserId();
  const reservations = await createTourReservations(userId, 1);
  const createdTour = await createDeliveryTour(userId, {
    name: "Tournee suppression P2.1",
    driver: "Equipe suppression",
    area: "Nantes",
    date: reservations[0].start_date,
    assignments: [{ reservation_id: reservations[0].id, assignment_type: "delivery" }],
  });

  await deleteDeliveryTour(userId, createdTour.id);

  const { rows: tourRows } = await query("SELECT id FROM delivery_tours WHERE id = $1", [createdTour.id]);
  const { rows: assignmentRows } = await query(
    "SELECT id FROM delivery_assignments WHERE tour_id = $1",
    [createdTour.id]
  );

  assert.equal(tourRows.length, 0);
  assert.equal(assignmentRows.length, 0);
});
