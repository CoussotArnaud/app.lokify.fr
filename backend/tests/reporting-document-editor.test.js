import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import {
  getDocumentsReport,
  getReservationDocument,
  updateReservationDocument,
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

test("reservation documents can be edited without losing manual content after sync", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const item = await getReservableItem(userId);
  const uniqueSuffix = crypto.randomUUID().slice(0, 6);
  const startDate = new Date(Date.now() + (520 + Math.floor(Math.random() * 40)) * 24 * 60 * 60 * 1000);
  startDate.setHours(9, 0, 0, 0);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  const reservation = await createReservation(userId, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "confirmed",
    notes: `Document edition ${uniqueSuffix}`,
    lines: [{ item_id: item.id, quantity: 1 }],
    deposit: {
      handling_mode: "manual",
      manual_status: "pending",
    },
  });

  const initialReport = await getDocumentsReport(userId);
  const groupedRow = initialReport.documents.find((row) => row.reservation_id === reservation.id);
  const invoiceDocument = groupedRow?.documents.find((document) => document.type === "invoice");

  assert.ok(invoiceDocument);

  const updatedTitle = `Facture adaptee ${uniqueSuffix}`;
  const updatedContent = `Facture adaptee pour ${reservation.reference}\nClause manuelle ${uniqueSuffix}`;
  const updatedNotes = `Notes support ${uniqueSuffix}`;
  const updatedDueAt = new Date(endDate.getTime() + 12 * 60 * 60 * 1000).toISOString();

  const updatedDocument = await updateReservationDocument(userId, invoiceDocument.id, {
    title: updatedTitle,
    status: "pending",
    due_at: updatedDueAt,
    content_text: updatedContent,
    notes: updatedNotes,
  });

  assert.equal(updatedDocument.title, updatedTitle);
  assert.equal(updatedDocument.status, "pending");
  assert.equal(updatedDocument.content_text, updatedContent);
  assert.equal(updatedDocument.notes, updatedNotes);

  await getDocumentsReport(userId);
  const persistedDocument = await getReservationDocument(userId, invoiceDocument.id);

  assert.equal(persistedDocument.title, updatedTitle);
  assert.equal(persistedDocument.status, "pending");
  assert.equal(persistedDocument.content_text, updatedContent);
  assert.equal(persistedDocument.notes, updatedNotes);
  assert.equal(persistedDocument.amount, reservation.total_amount);
  assert.equal(persistedDocument.deposit_amount, reservation.total_deposit);
});
