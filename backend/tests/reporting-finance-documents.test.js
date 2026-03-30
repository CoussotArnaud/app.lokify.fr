import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import {
  getCashJournal,
  getReportingOverview,
  getStatistics,
} from "../src/services/reporting.service.js";
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

test("reporting metrics exclude deposits from revenue and expose linked documents and cash entries", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const item = await getReservableItem(userId);
  const beforeStatistics = await getStatistics(userId, { window: 90 });
  const uniqueSuffix = crypto.randomUUID().slice(0, 6);
  const startDate = new Date(Date.now() + (420 + Math.floor(Math.random() * 30)) * 24 * 60 * 60 * 1000);
  startDate.setHours(10, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);

  const reservation = await createReservation(userId, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "confirmed",
    notes: `Reporting V2 ${uniqueSuffix}`,
    lines: [{ item_id: item.id, quantity: 1 }],
    deposit: {
      handling_mode: "manual",
      manual_status: "pending",
    },
  });

  const afterStatistics = await getStatistics(userId, { window: 90 });
  const overview = await getReportingOverview(userId);
  const cash = await getCashJournal(userId);

  assert.equal(
    afterStatistics.metrics.confirmed_revenue - beforeStatistics.metrics.confirmed_revenue,
    reservation.total_amount
  );
  assert.notEqual(
    afterStatistics.metrics.confirmed_revenue - beforeStatistics.metrics.confirmed_revenue,
    reservation.total_amount + reservation.total_deposit
  );

  const linkedReservationDocuments = overview.documents.find((row) => row.id === reservation.id);
  assert.ok(linkedReservationDocuments);
  assert.equal(linkedReservationDocuments.invoiceStatus, "A regler");
  assert.equal(linkedReservationDocuments.location_amount, reservation.total_amount);
  assert.equal(linkedReservationDocuments.deposit_amount, reservation.total_deposit);

  const invoiceDocument = overview.invoices.find(
    (invoice) => invoice.reservation_reference === reservation.reference
  );
  assert.ok(invoiceDocument);
  assert.equal(invoiceDocument.amount, reservation.total_amount);
  assert.equal(invoiceDocument.deposit_amount, reservation.total_deposit);

  const revenueEntry = cash.entries.find(
    (entry) => entry.reservation_id === reservation.id && entry.family === "revenue"
  );
  const depositEntry = cash.entries.find(
    (entry) => entry.reservation_id === reservation.id && entry.family === "deposit"
  );

  assert.ok(revenueEntry);
  assert.equal(revenueEntry.amount, reservation.total_amount);
  assert.equal(revenueEntry.status, "A encaisser");
  assert.ok(depositEntry);
  assert.equal(depositEntry.amount, reservation.total_deposit);
  assert.equal(depositEntry.status, "A recuperer");
});
