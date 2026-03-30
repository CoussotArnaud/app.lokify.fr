import crypto from "crypto";

import { pool, query } from "../config/db.js";
import { recordDomainEvent } from "./domain-events.service.js";
import HttpError from "../utils/http-error.js";

const allowedStatuses = new Set(["draft", "confirmed", "completed", "cancelled", "pending"]);
const activeAvailabilityStatuses = new Set(["draft", "confirmed", "pending"]);
const allowedSources = new Set(["manual", "phone", "web", "quote", "marketplace"]);
const allowedFulfillmentModes = new Set(["pickup", "delivery", "onsite"]);
const allowedDepositHandlingModes = new Set(["manual", "stripe_ready"]);
const allowedDepositStatuses = new Set([
  "not_required",
  "pending",
  "collected",
  "released",
  "waived",
]);

const reservationSelect = `
  SELECT
    reservations.*,
    clients.first_name || ' ' || clients.last_name AS client_name,
    items.name AS legacy_item_name,
    items.category AS legacy_item_category,
    items.price AS legacy_item_price,
    items.deposit AS legacy_item_deposit
  FROM reservations
  INNER JOIN clients ON clients.id = reservations.client_id
  LEFT JOIN items ON items.id = reservations.item_id
`;

const createReservationReference = (reservationId) =>
  `RSV-${String(reservationId || "")
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase()}`;

const normalizeReservationLinePayload = (payload = {}) => {
  const rawQuantity = Number(payload.quantity ?? 1);
  const rawUnitPrice = payload.unit_price ?? payload.unitPrice;
  const notes = String(payload.notes ?? "").trim();

  return {
    item_id: String(payload.item_id ?? payload.itemId ?? "").trim(),
    quantity: rawQuantity,
    unit_price:
      rawUnitPrice === null || rawUnitPrice === undefined || rawUnitPrice === ""
        ? null
        : Number(rawUnitPrice),
    notes,
  };
};

const buildReservationLineMergeKey = (line) => {
  const unitPriceKey =
    line.unit_price === null || line.unit_price === undefined || line.unit_price === ""
      ? ""
      : Number(line.unit_price).toFixed(2);

  return [line.item_id, unitPriceKey, line.notes || ""].join("::");
};

const normalizeReservationPayload = (payload = {}) => ({
  client_id: String(payload.client_id ?? payload.clientId ?? "").trim(),
  item_id: String(payload.item_id ?? payload.itemId ?? "").trim(),
  start_date: String(payload.start_date ?? payload.startDate ?? "").trim(),
  end_date: String(payload.end_date ?? payload.endDate ?? "").trim(),
  status: String(payload.status ?? "draft").trim() || "draft",
  notes: String(payload.notes ?? "").trim(),
  source: String(payload.source ?? "manual").trim() || "manual",
  fulfillment_mode:
    String(payload.fulfillment_mode ?? payload.fulfillmentMode ?? "pickup").trim() || "pickup",
  lines: Array.isArray(payload.lines) ? payload.lines : [],
  deposit: payload.deposit ?? payload.deposit_tracking ?? {},
});

const normalizeDepositPayload = (payload = {}) => ({
  handling_mode: String(payload.handling_mode ?? payload.handlingMode ?? "manual").trim() || "manual",
  manual_status: String(payload.manual_status ?? payload.manualStatus ?? "").trim(),
  manual_method: String(payload.manual_method ?? payload.manualMethod ?? "").trim(),
  manual_reference: String(payload.manual_reference ?? payload.manualReference ?? "").trim(),
  notes: String(payload.notes ?? "").trim(),
});

const mergeReservationLines = (lines) => {
  const mergedLines = new Map();
  const order = [];

  lines.forEach((line) => {
    const normalizedLine = normalizeReservationLinePayload(line);
    const mergeKey = buildReservationLineMergeKey(normalizedLine);

    if (!normalizedLine.item_id) {
      return;
    }

    if (!mergedLines.has(mergeKey)) {
      mergedLines.set(mergeKey, {
        ...normalizedLine,
        quantity: normalizedLine.quantity,
      });
      order.push(mergeKey);
      return;
    }

    const currentLine = mergedLines.get(mergeKey);
    mergedLines.set(mergeKey, {
      ...currentLine,
      quantity: currentLine.quantity + normalizedLine.quantity,
      unit_price: currentLine.unit_price ?? normalizedLine.unit_price,
      notes: currentLine.notes || normalizedLine.notes,
    });
  });

  return order.map((mergeKey, index) => ({
    ...mergedLines.get(mergeKey),
    sort_order: index,
  }));
};

const buildPayloadLines = (reservationPayload) => {
  const rawLines =
    reservationPayload.lines.length > 0
      ? reservationPayload.lines
      : reservationPayload.item_id
        ? [{ item_id: reservationPayload.item_id, quantity: 1 }]
        : [];

  return mergeReservationLines(rawLines);
};

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

const calculateDurationInDays = (startDate, endDate) =>
  Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

const calculateDepositAmount = (lines) =>
  lines.reduce(
    (sum, line) => sum + Number(line.item.deposit || 0) * Number(line.quantity || 0),
    0
  );

const buildReservationEventPayload = ({
  reference,
  reservation,
  startDate,
  endDate,
  lines,
  totalAmount,
  calculatedDepositAmount,
  previousStatus = null,
}) => ({
  reference,
  client_id: reservation.client_id,
  status: reservation.status,
  previous_status: previousStatus,
  source: reservation.source,
  fulfillment_mode: reservation.fulfillment_mode,
  start_date: startDate.toISOString(),
  end_date: endDate.toISOString(),
  total_amount: Number(totalAmount || 0),
  total_deposit: Number(calculatedDepositAmount || 0),
  line_count: lines.length,
  total_quantity: lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
  lines: lines.map((line) => ({
    item_id: line.item_id,
    item_name: line.item.name,
    quantity: Number(line.quantity || 0),
    unit_price: Number(line.unit_price || 0),
    line_total: Number(line.line_total || 0),
  })),
});

const listItemRowsByIds = async (userId, itemIds, executor = query) => {
  const uniqueItemIds = [...new Set(itemIds.filter(Boolean))];

  if (!uniqueItemIds.length) {
    return [];
  }

  const placeholders = uniqueItemIds.map((_, index) => `$${index + 2}`).join(", ");
  const { rows } = await executor(
    `
      SELECT *
      FROM items
      WHERE user_id = $1
        AND id IN (${placeholders})
    `,
    [userId, ...uniqueItemIds]
  );

  return rows;
};

const buildSqlPlaceholders = (values, startIndex = 1) =>
  values.map((_, index) => `$${index + startIndex}`).join(", ");

const ensureReservationPayload = async (userId, payload, executor = query) => {
  const reservation = normalizeReservationPayload(payload);
  const lines = buildPayloadLines(reservation);
  const deposit = normalizeDepositPayload(reservation.deposit);

  if (!reservation.client_id) {
    throw new HttpError(400, "Le client est obligatoire.");
  }

  if (!lines.length) {
    throw new HttpError(400, "Ajoutez au moins un produit a la reservation.");
  }

  if (!allowedStatuses.has(reservation.status)) {
    throw new HttpError(400, "Statut de reservation invalide.");
  }

  if (!allowedSources.has(reservation.source)) {
    throw new HttpError(400, "Source de reservation invalide.");
  }

  if (!allowedFulfillmentModes.has(reservation.fulfillment_mode)) {
    throw new HttpError(400, "Mode logistique invalide.");
  }

  if (!allowedDepositHandlingModes.has(deposit.handling_mode)) {
    throw new HttpError(400, "Mode de caution invalide.");
  }

  if (deposit.manual_status && !allowedDepositStatuses.has(deposit.manual_status)) {
    throw new HttpError(400, "Statut de caution invalide.");
  }

  const { startDate, endDate } = validateDates(reservation.start_date, reservation.end_date);
  const durationInDays = calculateDurationInDays(startDate, endDate);

  const [{ rows: clientRows }, itemRows] = await Promise.all([
    executor(
      `
        SELECT id, archived_at
        FROM clients
        WHERE id = $1
          AND user_id = $2
      `,
      [reservation.client_id, userId]
    ),
    listItemRowsByIds(
      userId,
      lines.map((line) => line.item_id),
      executor
    ),
  ]);

  if (!clientRows[0]) {
    throw new HttpError(404, "Client introuvable pour cette reservation.");
  }

  if (clientRows[0].archived_at) {
    throw new HttpError(
      409,
      "Ce client est archive. Restaurez-le avant de creer ou modifier une reservation."
    );
  }

  const itemsById = new Map(itemRows.map((item) => [item.id, item]));

  lines.forEach((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new HttpError(400, "Chaque ligne doit avoir une quantite valide.");
    }

    if (line.unit_price !== null && (!Number.isFinite(line.unit_price) || line.unit_price < 0)) {
      throw new HttpError(400, "Le prix unitaire d'une ligne est invalide.");
    }

    if (!itemsById.has(line.item_id)) {
      throw new HttpError(404, "Un produit de la reservation est introuvable.");
    }
  });

  const normalizedLines = lines.map((line, index) => {
    const item = itemsById.get(line.item_id);
    const unitPrice = line.unit_price === null ? Number(item.price || 0) : Number(line.unit_price);
    const lineTotal = unitPrice * line.quantity * durationInDays;

    return {
      ...line,
      item,
      quantity: Number(line.quantity),
      unit_price: unitPrice,
      line_total: lineTotal,
      sort_order: index,
    };
  });

  return {
    reservation,
    deposit,
    startDate,
    endDate,
    durationInDays,
    lines: normalizedLines,
    primaryItem: normalizedLines[0].item,
    totalAmount: normalizedLines.reduce((sum, line) => sum + line.line_total, 0),
    calculatedDepositAmount: calculateDepositAmount(normalizedLines),
  };
};

const ensureAvailability = async (
  userId,
  line,
  startDate,
  endDate,
  ignoreReservationId = null,
  executor = query
) => {
  const [{ rows: lineRows }, { rows: legacyCandidateRows }] = await Promise.all([
    executor(
      `
        SELECT COALESCE(SUM(reservation_lines.quantity), 0) AS reserved_quantity
        FROM reservation_lines
        INNER JOIN reservations ON reservations.id = reservation_lines.reservation_id
        WHERE reservations.user_id = $1
          AND reservation_lines.item_id = $2
          AND ($3::uuid IS NULL OR reservations.id <> $3::uuid)
          AND reservations.status IN ('draft', 'confirmed', 'pending')
          AND NOT ($5::timestamptz <= reservations.start_date OR $4::timestamptz >= reservations.end_date)
      `,
      [userId, line.item_id, ignoreReservationId, startDate.toISOString(), endDate.toISOString()]
    ),
    executor(
      `
        SELECT id
        FROM reservations
        WHERE reservations.user_id = $1
          AND reservations.item_id = $2
          AND ($3::uuid IS NULL OR reservations.id <> $3::uuid)
          AND reservations.status IN ('draft', 'confirmed', 'pending')
          AND NOT ($5::timestamptz <= reservations.start_date OR $4::timestamptz >= reservations.end_date)
      `,
      [userId, line.item_id, ignoreReservationId, startDate.toISOString(), endDate.toISOString()]
    ),
  ]);

  let legacyReservedQuantity = 0;
  const legacyCandidateIds = legacyCandidateRows.map((row) => row.id);

  if (legacyCandidateIds.length) {
    const placeholders = buildSqlPlaceholders(legacyCandidateIds, 1);
    const { rows: existingLineRows } = await executor(
      `
        SELECT DISTINCT reservation_id
        FROM reservation_lines
        WHERE reservation_id IN (${placeholders})
      `,
      legacyCandidateIds
    );
    const reservationIdsWithLines = new Set(existingLineRows.map((row) => row.reservation_id));

    legacyReservedQuantity = legacyCandidateIds.filter(
      (reservationId) => !reservationIdsWithLines.has(reservationId)
    ).length;
  }

  const reservedQuantity =
    Number(lineRows[0]?.reserved_quantity || 0) + legacyReservedQuantity;
  const availableStock = Number(line.item.stock || 0);

  if (reservedQuantity + line.quantity > availableStock) {
    throw new HttpError(
      409,
      `Le produit "${line.item.name}" n'a plus assez de disponibilite sur ce creneau.`
    );
  }
};

const fetchReservationLinesByIds = async (userId, reservationIds, executor = query) => {
  const uniqueReservationIds = [...new Set(reservationIds.filter(Boolean))];

  if (!uniqueReservationIds.length) {
    return new Map();
  }

  const placeholders = uniqueReservationIds.map((_, index) => `$${index + 2}`).join(", ");
  const { rows } = await executor(
    `
      SELECT
        reservation_lines.*,
        items.name AS item_name,
        items.category AS item_category,
        items.deposit AS item_deposit
      FROM reservation_lines
      INNER JOIN items ON items.id = reservation_lines.item_id
      WHERE reservation_lines.user_id = $1
        AND reservation_lines.reservation_id IN (${placeholders})
      ORDER BY reservation_lines.sort_order ASC, reservation_lines.created_at ASC
    `,
    [userId, ...uniqueReservationIds]
  );

  const linesByReservationId = new Map();

  rows.forEach((row) => {
    const reservationLines = linesByReservationId.get(row.reservation_id) || [];
    reservationLines.push({
      ...row,
      quantity: Number(row.quantity || 0),
      unit_price: Number(row.unit_price || 0),
      line_total: Number(row.line_total || 0),
      item_deposit: Number(row.item_deposit || 0),
    });
    linesByReservationId.set(row.reservation_id, reservationLines);
  });

  return linesByReservationId;
};

const fetchReservationDepositsByIds = async (userId, reservationIds, executor = query) => {
  const uniqueReservationIds = [...new Set(reservationIds.filter(Boolean))];

  if (!uniqueReservationIds.length) {
    return new Map();
  }

  const placeholders = uniqueReservationIds.map((_, index) => `$${index + 2}`).join(", ");
  const { rows } = await executor(
    `
      SELECT *
      FROM reservation_deposits
      WHERE user_id = $1
        AND reservation_id IN (${placeholders})
    `,
    [userId, ...uniqueReservationIds]
  );

  return new Map(
    rows.map((row) => [
      row.reservation_id,
      {
        ...row,
        calculated_amount: Number(row.calculated_amount || 0),
      },
    ])
  );
};

const fetchReservationLineUnitsByIds = async (userId, reservationIds, executor = query) => {
  const uniqueReservationIds = [...new Set(reservationIds.filter(Boolean))];

  if (!uniqueReservationIds.length) {
    return new Map();
  }

  const placeholders = uniqueReservationIds.map((_, index) => `$${index + 2}`).join(", ");
  const { rows } = await executor(
    `
      SELECT
        reservation_line_units.*,
        product_units.label AS unit_label,
        product_units.serial_number AS unit_serial_number,
        product_units.status AS unit_status
      FROM reservation_line_units
      INNER JOIN product_units ON product_units.id = reservation_line_units.product_unit_id
      WHERE reservation_line_units.user_id = $1
        AND reservation_line_units.reservation_id IN (${placeholders})
      ORDER BY reservation_line_units.assigned_at ASC
    `,
    [userId, ...uniqueReservationIds]
  );

  const assignmentsByLineId = new Map();

  rows.forEach((row) => {
    const currentAssignments = assignmentsByLineId.get(row.reservation_line_id) || [];
    currentAssignments.push(row);
    assignmentsByLineId.set(row.reservation_line_id, currentAssignments);
  });

  return assignmentsByLineId;
};

const fetchReservationOperationRecordsByIds = async (
  tableName,
  userId,
  reservationIds,
  executor = query
) => {
  const uniqueReservationIds = [...new Set(reservationIds.filter(Boolean))];

  if (!uniqueReservationIds.length) {
    return new Map();
  }

  const placeholders = uniqueReservationIds.map((_, index) => `$${index + 2}`).join(", ");
  const { rows } = await executor(
    `
      SELECT *
      FROM ${tableName}
      WHERE user_id = $1
        AND reservation_id IN (${placeholders})
    `,
    [userId, ...uniqueReservationIds]
  );

  return new Map(rows.map((row) => [row.reservation_id, row]));
};

const syncReservationDeposit = async (
  userId,
  reservationId,
  calculatedDepositAmount,
  depositPayload,
  executor
) => {
  const { rows } = await executor(
    `
      SELECT *
      FROM reservation_deposits
      WHERE reservation_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [reservationId, userId]
  );

  const existingDeposit = rows[0];
  const calculatedAmount = Number(calculatedDepositAmount || 0);
  const defaultManualStatus = calculatedAmount > 0 ? "pending" : "not_required";
  const nextManualStatus =
    calculatedAmount > 0
      ? depositPayload.manual_status || existingDeposit?.manual_status || defaultManualStatus
      : "not_required";
  const nowIso = new Date().toISOString();
  const nextCollectedAt =
    nextManualStatus === "collected" || nextManualStatus === "released"
      ? existingDeposit?.collected_at || nowIso
      : existingDeposit?.collected_at || null;
  const nextReleasedAt =
    nextManualStatus === "released" ? existingDeposit?.released_at || nowIso : existingDeposit?.released_at || null;

  await executor(
    `
      INSERT INTO reservation_deposits (
        reservation_id,
        user_id,
        handling_mode,
        calculated_amount,
        manual_status,
        manual_method,
        manual_reference,
        notes,
        collected_at,
        released_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (reservation_id)
      DO UPDATE SET
        handling_mode = EXCLUDED.handling_mode,
        calculated_amount = EXCLUDED.calculated_amount,
        manual_status = EXCLUDED.manual_status,
        manual_method = EXCLUDED.manual_method,
        manual_reference = EXCLUDED.manual_reference,
        notes = EXCLUDED.notes,
        collected_at = EXCLUDED.collected_at,
        released_at = EXCLUDED.released_at
    `,
    [
      reservationId,
      userId,
      depositPayload.handling_mode || existingDeposit?.handling_mode || "manual",
      calculatedAmount,
      nextManualStatus,
      depositPayload.manual_method || existingDeposit?.manual_method || null,
      depositPayload.manual_reference || existingDeposit?.manual_reference || null,
      depositPayload.notes || existingDeposit?.notes || null,
      nextCollectedAt,
      nextReleasedAt,
    ]
  );
};

const buildFallbackLine = (row) => [
  {
    id: `${row.id}-legacy-line`,
    reservation_id: row.id,
    user_id: row.user_id,
    item_id: row.item_id,
    item_name: row.legacy_item_name || "Produit indisponible",
    item_category: row.legacy_item_category || "Catalogue",
    item_deposit: Number(row.legacy_item_deposit || 0),
    quantity: 1,
    unit_price: Number(row.legacy_item_price || 0),
    line_total: Number(row.total_amount || 0),
    sort_order: 0,
    notes: "",
  },
];

const summarizeLines = (lines) => {
  if (!lines.length) {
    return {
      itemSummary: "Produit indisponible",
      primaryItemName: "Produit indisponible",
      category: "Catalogue",
      totalQuantity: 0,
      totalDeposit: 0,
    };
  }

  const totalQuantity = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const totalDeposit = lines.reduce(
    (sum, line) => sum + Number(line.item_deposit || 0) * Number(line.quantity || 0),
    0
  );
  const uniqueCategories = [...new Set(lines.map((line) => line.item_category).filter(Boolean))];
  const primaryLine = lines[0];
  const primaryQuantitySuffix = primaryLine.quantity > 1 ? ` x${primaryLine.quantity}` : "";
  const itemSummary =
    lines.length === 1
      ? `${primaryLine.item_name}${primaryQuantitySuffix}`
      : `${primaryLine.item_name}${primaryQuantitySuffix} +${lines.length - 1} produit(s)`;

  return {
    itemSummary,
    primaryItemName: primaryLine.item_name,
    category: uniqueCategories.length === 1 ? uniqueCategories[0] : "Multi-categories",
    totalQuantity,
    totalDeposit,
  };
};

const hydrateReservations = async (userId, reservationRows, executor = query) => {
  const reservationIds = reservationRows.map((reservation) => reservation.id);
  const [
    linesByReservationId,
    depositsByReservationId,
    assignmentsByLineId,
    departuresByReservationId,
    returnsByReservationId,
  ] = await Promise.all([
    fetchReservationLinesByIds(userId, reservationIds, executor),
    fetchReservationDepositsByIds(userId, reservationIds, executor),
    fetchReservationLineUnitsByIds(userId, reservationIds, executor),
    fetchReservationOperationRecordsByIds("reservation_departures", userId, reservationIds, executor),
    fetchReservationOperationRecordsByIds("reservation_returns", userId, reservationIds, executor),
  ]);

  return reservationRows.map((row) => {
    const baseLines = linesByReservationId.get(row.id) || buildFallbackLine(row);
    const lines = baseLines.map((line) => ({
      ...line,
      assigned_units: assignmentsByLineId.get(line.id) || [],
    }));
    const summary = summarizeLines(lines);
    const depositRecord = depositsByReservationId.get(row.id) || {
      handling_mode: "manual",
      calculated_amount: summary.totalDeposit,
      manual_status: summary.totalDeposit > 0 ? "pending" : "not_required",
      manual_method: null,
      manual_reference: null,
      notes: null,
      collected_at: null,
      released_at: null,
    };
    const departureRecord = departuresByReservationId.get(row.id) || null;
    const returnRecord = returnsByReservationId.get(row.id) || null;

    return {
      ...row,
      reference: row.reference || createReservationReference(row.id),
      source: row.source || "manual",
      fulfillment_mode: row.fulfillment_mode || "pickup",
      lines,
      line_count: lines.length,
      total_quantity: summary.totalQuantity,
      total_deposit: Number(depositRecord.calculated_amount || summary.totalDeposit),
      deposit_tracking: {
        handling_mode: depositRecord.handling_mode || "manual",
        calculated_amount: Number(depositRecord.calculated_amount || summary.totalDeposit),
        manual_status: depositRecord.manual_status || (summary.totalDeposit > 0 ? "pending" : "not_required"),
        manual_method: depositRecord.manual_method || null,
        manual_reference: depositRecord.manual_reference || null,
        notes: depositRecord.notes || null,
        collected_at: depositRecord.collected_at || null,
        released_at: depositRecord.released_at || null,
      },
      departure_tracking: departureRecord
        ? {
            status: departureRecord.status,
            processed_at: departureRecord.processed_at || null,
            notes: departureRecord.notes || null,
          }
        : null,
      return_tracking: returnRecord
        ? {
            status: returnRecord.status,
            processed_at: returnRecord.processed_at || null,
            notes: returnRecord.notes || null,
          }
        : null,
      item_name: summary.itemSummary,
      primary_item_name: summary.primaryItemName,
      category: summary.category,
      total_amount: Number(row.total_amount || 0),
    };
  });
};

const getReservationHeaderById = async (userId, reservationId, executor = query) => {
  const { rows } = await executor(
    `${reservationSelect} WHERE reservations.user_id = $1 AND reservations.id = $2`,
    [userId, reservationId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Reservation introuvable.");
  }

  return rows[0];
};

const getReservationById = async (userId, reservationId) => {
  const reservation = await getReservationHeaderById(userId, reservationId);
  const [hydratedReservation] = await hydrateReservations(userId, [reservation]);
  return hydratedReservation;
};

const replaceReservationLines = async (userId, reservationId, lines, executor) => {
  await executor("DELETE FROM reservation_lines WHERE reservation_id = $1 AND user_id = $2", [
    reservationId,
    userId,
  ]);

  for (const line of lines) {
    await executor(
      `
        INSERT INTO reservation_lines (
          id,
          reservation_id,
          user_id,
          item_id,
          quantity,
          unit_price,
          line_total,
          sort_order,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        crypto.randomUUID(),
        reservationId,
        userId,
        line.item_id,
        line.quantity,
        line.unit_price,
        line.line_total,
        line.sort_order,
        line.notes,
      ]
    );
  }
};

export const listReservations = async (userId, filters = {}) => {
  const values = [userId];
  const whereParts = ["reservations.user_id = $1"];
  const requestedClientId = String(filters.client_id ?? filters.clientId ?? "").trim();

  if (requestedClientId) {
    values.push(requestedClientId);
    whereParts.push(`reservations.client_id = $${values.length}`);
  }

  const { rows } = await query(
    `
      ${reservationSelect}
      WHERE ${whereParts.join(" AND ")}
      ORDER BY reservations.start_date ASC
    `,
    values
  );

  return hydrateReservations(userId, rows);
};

export const createReservation = async (userId, payload) => {
  const dbClient = await pool.connect();
  let createdReservationId = null;

  try {
    await dbClient.query("BEGIN");

    const {
      reservation,
      deposit,
      startDate,
      endDate,
      lines,
      primaryItem,
      totalAmount,
      calculatedDepositAmount,
      } =
        await ensureReservationPayload(userId, payload, dbClient.query.bind(dbClient));
      const reservationId = crypto.randomUUID();
      const reference = createReservationReference(reservationId);
      createdReservationId = reservationId;

    if (activeAvailabilityStatuses.has(reservation.status)) {
      for (const line of lines) {
        await ensureAvailability(
          userId,
          line,
          startDate,
          endDate,
          null,
          dbClient.query.bind(dbClient)
        );
      }
    }

    await dbClient.query(
      `
        INSERT INTO reservations (
          id,
          user_id,
          client_id,
          item_id,
          reference,
          source,
          fulfillment_mode,
          start_date,
          end_date,
          status,
          total_amount,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        reservationId,
        userId,
        reservation.client_id,
        primaryItem.id,
        reference,
        reservation.source,
        reservation.fulfillment_mode,
        startDate.toISOString(),
        endDate.toISOString(),
        reservation.status,
        totalAmount,
        reservation.notes,
      ]
    );

    await replaceReservationLines(userId, reservationId, lines, dbClient.query.bind(dbClient));
      await syncReservationDeposit(
        userId,
        reservationId,
        calculatedDepositAmount,
        deposit,
        dbClient.query.bind(dbClient)
      );
      await recordDomainEvent(dbClient.query.bind(dbClient), {
        userId,
        aggregateType: "reservation",
        aggregateId: reservationId,
        eventType: "reservation.created",
        payload: buildReservationEventPayload({
          reference,
          reservation,
          startDate,
          endDate,
          lines,
          totalAmount,
          calculatedDepositAmount,
        }),
      });
      await dbClient.query("COMMIT");

      return getReservationById(userId, createdReservationId);
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
};

export const updateReservation = async (userId, reservationId, payload) => {
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");

    const existingReservation = await getReservationHeaderById(
      userId,
      reservationId,
      dbClient.query.bind(dbClient)
    );
    const {
      reservation,
      deposit,
      startDate,
      endDate,
      lines,
      primaryItem,
      totalAmount,
      calculatedDepositAmount,
    } =
      await ensureReservationPayload(userId, payload, dbClient.query.bind(dbClient));

    if (activeAvailabilityStatuses.has(reservation.status)) {
      for (const line of lines) {
        await ensureAvailability(
          userId,
          line,
          startDate,
          endDate,
          reservationId,
          dbClient.query.bind(dbClient)
        );
      }
    }

    await dbClient.query(
      `
        UPDATE reservations
        SET client_id = $3,
            item_id = $4,
            reference = $5,
            source = $6,
            fulfillment_mode = $7,
            start_date = $8,
            end_date = $9,
            status = $10,
            total_amount = $11,
            notes = $12
        WHERE id = $1 AND user_id = $2
      `,
      [
        reservationId,
        userId,
        reservation.client_id,
        primaryItem.id,
        existingReservation.reference || createReservationReference(reservationId),
        reservation.source,
        reservation.fulfillment_mode,
        startDate.toISOString(),
        endDate.toISOString(),
        reservation.status,
        totalAmount,
        reservation.notes,
      ]
    );

    await replaceReservationLines(userId, reservationId, lines, dbClient.query.bind(dbClient));
      await syncReservationDeposit(
        userId,
        reservationId,
        calculatedDepositAmount,
        deposit,
        dbClient.query.bind(dbClient)
      );
      await recordDomainEvent(dbClient.query.bind(dbClient), {
        userId,
        aggregateType: "reservation",
        aggregateId: reservationId,
        eventType: "reservation.updated",
        payload: buildReservationEventPayload({
          reference: existingReservation.reference || createReservationReference(reservationId),
          reservation,
          startDate,
          endDate,
          lines,
          totalAmount,
          calculatedDepositAmount,
          previousStatus: existingReservation.status,
        }),
      });

      if (existingReservation.status !== reservation.status) {
        await recordDomainEvent(dbClient.query.bind(dbClient), {
          userId,
          aggregateType: "reservation",
          aggregateId: reservationId,
          eventType: "reservation.status_changed",
          payload: {
            reference: existingReservation.reference || createReservationReference(reservationId),
            from: existingReservation.status,
            to: reservation.status,
          },
        });
      }
      await dbClient.query("COMMIT");

    return getReservationById(userId, reservationId);
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
};

export const deleteReservation = async (userId, reservationId) => {
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const existingReservation = await getReservationById(userId, reservationId);
    const { rows } = await dbClient.query(
      "DELETE FROM reservations WHERE id = $1 AND user_id = $2 RETURNING id",
      [reservationId, userId]
    );

    if (!rows[0]) {
      throw new HttpError(404, "Reservation introuvable.");
    }

    await recordDomainEvent(dbClient.query.bind(dbClient), {
      userId,
      aggregateType: "reservation",
      aggregateId: reservationId,
      eventType: "reservation.deleted",
      payload: {
        reference: existingReservation.reference,
        status: existingReservation.status,
        total_amount: Number(existingReservation.total_amount || 0),
        total_deposit: Number(existingReservation.total_deposit || 0),
      },
    });

    await dbClient.query("COMMIT");
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
};
