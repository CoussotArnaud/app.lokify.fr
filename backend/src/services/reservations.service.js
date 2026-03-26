import crypto from "crypto";

import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";

const allowedStatuses = new Set(["draft", "confirmed", "completed", "cancelled"]);

const reservationSelect = `
  SELECT
    reservations.*,
    clients.first_name || ' ' || clients.last_name AS client_name,
    items.name AS item_name
  FROM reservations
  INNER JOIN clients ON clients.id = reservations.client_id
  INNER JOIN items ON items.id = reservations.item_id
`;

const normalizeReservationPayload = (payload = {}) => ({
  client_id: String(payload.client_id ?? payload.clientId ?? "").trim(),
  item_id: String(payload.item_id ?? payload.itemId ?? "").trim(),
  start_date: String(payload.start_date ?? payload.startDate ?? "").trim(),
  end_date: String(payload.end_date ?? payload.endDate ?? "").trim(),
  status: String(payload.status ?? "draft").trim() || "draft",
  notes: String(payload.notes ?? "").trim(),
});

const validateDates = (startDateValue, endDateValue) => {
  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new HttpError(400, "Dates de reservation invalides.");
  }

  if (endDate <= startDate) {
    throw new HttpError(400, "La date de fin doit etre posterieure a la date de debut.");
  }

  return { startDate, endDate };
};

const ensureReservationPayload = async (userId, payload) => {
  const reservation = normalizeReservationPayload(payload);

  if (!reservation.client_id || !reservation.item_id) {
    throw new HttpError(400, "Client et materiel sont obligatoires.");
  }

  if (!allowedStatuses.has(reservation.status)) {
    throw new HttpError(400, "Statut de reservation invalide.");
  }

  const { startDate, endDate } = validateDates(reservation.start_date, reservation.end_date);
  const [{ rows: clientRows }, { rows: itemRows }] = await Promise.all([
    query("SELECT id FROM clients WHERE id = $1 AND user_id = $2", [reservation.client_id, userId]),
    query("SELECT id, price FROM items WHERE id = $1 AND user_id = $2", [reservation.item_id, userId]),
  ]);

  if (!clientRows[0]) {
    throw new HttpError(404, "Client introuvable pour cette reservation.");
  }

  if (!itemRows[0]) {
    throw new HttpError(404, "Materiel introuvable pour cette reservation.");
  }

  return {
    reservation,
    startDate,
    endDate,
    item: itemRows[0],
  };
};

const ensureAvailability = async (userId, itemId, startDate, endDate, ignoreReservationId = null) => {
  const { rows } = await query(
    `
      SELECT id
      FROM reservations
      WHERE user_id = $1
        AND item_id = $2
        AND ($3::uuid IS NULL OR id <> $3::uuid)
        AND status IN ('draft', 'confirmed')
        AND NOT ($5::timestamptz <= start_date OR $4::timestamptz >= end_date)
      LIMIT 1
    `,
    [userId, itemId, ignoreReservationId, startDate.toISOString(), endDate.toISOString()]
  );

  if (rows[0]) {
    throw new HttpError(409, "Ce materiel est deja reserve sur ce creneau.");
  }
};

const calculateTotalAmount = (itemPrice, startDate, endDate) => {
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationInDays = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));

  return Number(itemPrice) * durationInDays;
};

const getReservationById = async (userId, reservationId) => {
  const { rows } = await query(
    `${reservationSelect} WHERE reservations.user_id = $1 AND reservations.id = $2`,
    [userId, reservationId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Reservation introuvable.");
  }

  return rows[0];
};

export const listReservations = async (userId) => {
  const { rows } = await query(
    `${reservationSelect} WHERE reservations.user_id = $1 ORDER BY reservations.start_date ASC`,
    [userId]
  );

  return rows;
};

export const createReservation = async (userId, payload) => {
  const { reservation, startDate, endDate, item } = await ensureReservationPayload(userId, payload);
  const reservationId = crypto.randomUUID();

  if (["draft", "confirmed"].includes(reservation.status)) {
    await ensureAvailability(userId, reservation.item_id, startDate, endDate);
  }

  const totalAmount = calculateTotalAmount(item.price, startDate, endDate);
  await query(
    `
      INSERT INTO reservations (id, user_id, client_id, item_id, start_date, end_date, status, total_amount, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      reservationId,
      userId,
      reservation.client_id,
      reservation.item_id,
      startDate.toISOString(),
      endDate.toISOString(),
      reservation.status,
      totalAmount,
      reservation.notes,
    ]
  );

  return getReservationById(userId, reservationId);
};

export const updateReservation = async (userId, reservationId, payload) => {
  await getReservationById(userId, reservationId);

  const { reservation, startDate, endDate, item } = await ensureReservationPayload(userId, payload);

  if (["draft", "confirmed"].includes(reservation.status)) {
    await ensureAvailability(userId, reservation.item_id, startDate, endDate, reservationId);
  }

  const totalAmount = calculateTotalAmount(item.price, startDate, endDate);
  await query(
    `
      UPDATE reservations
      SET client_id = $3,
          item_id = $4,
          start_date = $5,
          end_date = $6,
          status = $7,
          total_amount = $8,
          notes = $9
      WHERE id = $1 AND user_id = $2
    `,
    [
      reservationId,
      userId,
      reservation.client_id,
      reservation.item_id,
      startDate.toISOString(),
      endDate.toISOString(),
      reservation.status,
      totalAmount,
      reservation.notes,
    ]
  );

  return getReservationById(userId, reservationId);
};

export const deleteReservation = async (userId, reservationId) => {
  const { rows } = await query(
    "DELETE FROM reservations WHERE id = $1 AND user_id = $2 RETURNING id",
    [reservationId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Reservation introuvable.");
  }
};
