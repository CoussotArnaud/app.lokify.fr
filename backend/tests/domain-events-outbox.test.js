import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import { createDeliveryTour } from "../src/services/deliveries.service.js";
import { listDomainEvents } from "../src/services/domain-events.service.js";
import {
  completeReservationDeparture,
  completeReservationReturn,
} from "../src/services/operations.service.js";
import {
  createReservation,
  updateReservation,
} from "../src/services/reservations.service.js";

const getUserByRole = async (role) => {
  const { rows } = await query(
    `
      SELECT id, email, full_name, account_role
      FROM users
      WHERE account_role = $1
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [role]
  );

  return rows[0];
};

const getFirstClientId = async (userId) => {
  const { rows } = await query(
    "SELECT id FROM clients WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
    [userId]
  );

  return rows[0].id;
};

const getReservableItem = async (userId) => {
  const { rows } = await query(
    `
      SELECT id
      FROM items
      WHERE user_id = $1
        AND stock >= 1
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [userId]
  );

  return rows[0];
};

test("domain events outbox captures reservation lifecycle and delivery planning", async () => {
  const provider = await getUserByRole("provider");
  const superAdmin = await getUserByRole("super_admin");
  const clientId = await getFirstClientId(provider.id);
  const item = await getReservableItem(provider.id);
  const uniqueSuffix = crypto.randomUUID().slice(0, 6);
  const startDate = new Date(Date.now() + (680 + Math.floor(Math.random() * 30)) * 24 * 60 * 60 * 1000);
  startDate.setHours(8, 30, 0, 0);
  const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);

  const createdReservation = await createReservation(provider.id, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "draft",
    notes: `Evenements ${uniqueSuffix}`,
    lines: [{ item_id: item.id, quantity: 1 }],
  });

  const updatedReservation = await updateReservation(provider.id, createdReservation.id, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "confirmed",
    notes: `Evenements confirms ${uniqueSuffix}`,
    lines: [{ item_id: item.id, quantity: 1 }],
  });

  await completeReservationDeparture(provider.id, updatedReservation.id, {
    notes: `Depart ${uniqueSuffix}`,
  });
  await completeReservationReturn(provider.id, updatedReservation.id, {
    notes: `Retour ${uniqueSuffix}`,
  });
  await createDeliveryTour(provider.id, {
    name: `Tournee ${uniqueSuffix}`,
    area: "Zone Test",
    date: startDate.toISOString(),
    assignments: [
      {
        reservation_id: updatedReservation.id,
        assignment_type: "delivery",
      },
    ],
  });

  const providerEventsPayload = await listDomainEvents(provider, {
    limit: 20,
  });
  const providerEvents = providerEventsPayload.events.filter(
    (event) =>
      event.aggregate_id === updatedReservation.id ||
      event.payload.reference === updatedReservation.reference
  );
  const eventTypes = providerEvents.map((event) => event.event_type);

  assert.ok(eventTypes.includes("reservation.created"));
  assert.ok(eventTypes.includes("reservation.updated"));
  assert.ok(eventTypes.includes("reservation.status_changed"));
  assert.ok(eventTypes.includes("reservation.departure_completed"));
  assert.ok(eventTypes.includes("reservation.return_completed"));
  assert.ok(
    providerEventsPayload.events.some((event) => event.event_type === "delivery_tour.created")
  );

  const statusChangedEvent = providerEvents.find(
    (event) => event.event_type === "reservation.status_changed"
  );
  assert.equal(statusChangedEvent.payload.from, "draft");
  assert.equal(statusChangedEvent.payload.to, "confirmed");

  const superAdminPayload = await listDomainEvents(superAdmin, {
    provider_user_id: provider.id,
    limit: 20,
  });
  assert.ok(
    superAdminPayload.events.some(
      (event) =>
        event.aggregate_id === updatedReservation.id &&
        event.event_type === "reservation.departure_completed"
    )
  );
});
