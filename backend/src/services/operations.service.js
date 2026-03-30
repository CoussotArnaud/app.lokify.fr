import crypto from "crypto";

import { pool, query } from "../config/db.js";
import { recordDomainEvent } from "./domain-events.service.js";
import HttpError from "../utils/http-error.js";

const allowedUnitStatuses = new Set(["available", "out", "maintenance", "unavailable"]);

const toNumber = (value) => Number(value || 0);

const normalizeUnitPayload = (payload = {}) => ({
  label: String(payload.label ?? "").trim(),
  serial_number: String(payload.serial_number ?? payload.serialNumber ?? "").trim(),
  status:
    payload.status === undefined || payload.status === null
      ? ""
      : String(payload.status).trim(),
  condition_notes: String(payload.condition_notes ?? payload.conditionNotes ?? "").trim(),
  last_known_location: String(payload.last_known_location ?? payload.lastKnownLocation ?? "").trim(),
});

const normalizeOperationPayload = (payload = {}) => ({
  notes: String(payload.notes ?? "").trim(),
  last_known_location: String(payload.last_known_location ?? payload.lastKnownLocation ?? "").trim(),
});

const buildAutoUnitLabel = (itemName, index) =>
  `${itemName} #${String(index).padStart(3, "0")}`;

const buildReservationOperationEventPayload = ({
  reservation,
  lines,
  processedAt,
  notes,
  lastKnownLocation = "",
}) => ({
  reference: reservation.reference || reservation.id,
  reservation_id: reservation.id,
  client_name: reservation.client_name || "",
  processed_at: processedAt,
  last_known_location: lastKnownLocation || null,
  notes: notes || null,
  line_count: lines.length,
  total_quantity: lines.reduce((sum, line) => sum + toNumber(line.quantity), 0),
  items: lines.map((line) => ({
    item_id: line.item_id,
    item_name: line.item_name,
    quantity: toNumber(line.quantity),
    serial_tracking: Boolean(line.serial_tracking),
  })),
});

const ensureUnitStatus = (status) => {
  if (!allowedUnitStatuses.has(status)) {
    throw new HttpError(400, "Statut d'unite invalide.");
  }
};

const getItemTrackingContext = async (userId, itemId, executor = query) => {
  const { rows } = await executor(
    `
      SELECT
        items.*,
        COALESCE(item_profiles.serial_tracking, FALSE) AS serial_tracking
      FROM items
      LEFT JOIN item_profiles ON item_profiles.item_id = items.id
      WHERE items.id = $1
        AND items.user_id = $2
      LIMIT 1
    `,
    [itemId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Produit introuvable.");
  }

  return {
    ...rows[0],
    stock: toNumber(rows[0].stock),
    serial_tracking: Boolean(rows[0].serial_tracking),
  };
};

const getReservationContext = async (userId, reservationId, executor = query) => {
  const [{ rows: reservationRows }, { rows: lineRows }] = await Promise.all([
    executor(
      `
        SELECT
          reservations.*,
          clients.first_name || ' ' || clients.last_name AS client_name
        FROM reservations
        INNER JOIN clients ON clients.id = reservations.client_id
        WHERE reservations.id = $1
          AND reservations.user_id = $2
        LIMIT 1
      `,
      [reservationId, userId]
    ),
    executor(
      `
        SELECT
          reservation_lines.*,
          items.name AS item_name,
          items.category AS item_category,
          COALESCE(item_profiles.serial_tracking, FALSE) AS serial_tracking
        FROM reservation_lines
        INNER JOIN items ON items.id = reservation_lines.item_id
        LEFT JOIN item_profiles ON item_profiles.item_id = items.id
        WHERE reservation_lines.reservation_id = $1
          AND reservation_lines.user_id = $2
        ORDER BY reservation_lines.sort_order ASC, reservation_lines.created_at ASC
      `,
      [reservationId, userId]
    ),
  ]);

  if (!reservationRows[0]) {
    throw new HttpError(404, "Reservation introuvable.");
  }

  return {
    reservation: reservationRows[0],
    lines: lineRows.map((row) => ({
      ...row,
      quantity: toNumber(row.quantity),
      serial_tracking: Boolean(row.serial_tracking),
    })),
  };
};

const getExistingUnitCount = async (userId, itemId, executor = query) => {
  const { rows } = await executor(
    `
      SELECT COUNT(*) AS total
      FROM product_units
      WHERE user_id = $1
        AND item_id = $2
    `,
    [userId, itemId]
  );

  return toNumber(rows[0]?.total);
};

const serializeProductUnit = (row) => ({
  ...row,
  active_reservation: row.active_reservation_id
    ? {
        reservation_id: row.active_reservation_id,
        reservation_line_id: row.active_reservation_line_id,
        reference: row.active_reservation_reference,
      }
    : null,
});

const serializeStockMovement = (row) => ({
  ...row,
  quantity: toNumber(row.quantity),
});

const recordStockMovement = async (
  executor,
  {
    userId,
    itemId,
    reservationId = null,
    reservationLineId = null,
    productUnitId = null,
    movementType,
    quantity = 1,
    fromState = null,
    toState = null,
    notes = null,
    occurredAt = new Date().toISOString(),
  }
) => {
  await executor(
    `
      INSERT INTO stock_movements (
        id,
        user_id,
        item_id,
        reservation_id,
        reservation_line_id,
        product_unit_id,
        movement_type,
        quantity,
        from_state,
        to_state,
        notes,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
    [
      crypto.randomUUID(),
      userId,
      itemId,
      reservationId,
      reservationLineId,
      productUnitId,
      movementType,
      quantity,
      fromState,
      toState,
      notes || null,
      occurredAt,
    ]
  );
};

const createSingleProductUnit = async (userId, itemContext, payload, executor = query) => {
  const unit = normalizeUnitPayload(payload);
  const nextStatus = unit.status || "available";
  ensureUnitStatus(nextStatus);

  const existingCount = await getExistingUnitCount(userId, itemContext.id, executor);
  const label = unit.label || buildAutoUnitLabel(itemContext.name, existingCount + 1);

  const { rows } = await executor(
    `
      INSERT INTO product_units (
        id,
        item_id,
        user_id,
        label,
        serial_number,
        status,
        condition_notes,
        last_known_location
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      crypto.randomUUID(),
      itemContext.id,
      userId,
      label,
      unit.serial_number || null,
      nextStatus,
      unit.condition_notes || null,
      unit.last_known_location || null,
    ]
  );

  if (existingCount + 1 > itemContext.stock) {
    await executor(
      `
        UPDATE items
        SET stock = $3
        WHERE id = $1
          AND user_id = $2
      `,
      [itemContext.id, userId, existingCount + 1]
    );
  }

  await recordStockMovement(executor, {
    userId,
    itemId: itemContext.id,
    productUnitId: rows[0].id,
    movementType: "unit_created",
    quantity: 1,
    toState: nextStatus,
    notes: unit.serial_number ? `Creation unite ${label} (${unit.serial_number})` : `Creation unite ${label}`,
  });

  return rows[0];
};

const listLineAssignments = async (userId, reservationId, executor = query) => {
  const { rows } = await executor(
    `
      SELECT
        reservation_line_units.*,
        product_units.item_id,
        product_units.label,
        product_units.serial_number
      FROM reservation_line_units
      INNER JOIN product_units ON product_units.id = reservation_line_units.product_unit_id
      WHERE reservation_line_units.user_id = $1
        AND reservation_line_units.reservation_id = $2
      ORDER BY reservation_line_units.assigned_at ASC
    `,
    [userId, reservationId]
  );

  return rows;
};

const getOperationRecord = async (tableName, userId, reservationId, executor = query) => {
  const { rows } = await executor(
    `
      SELECT *
      FROM ${tableName}
      WHERE user_id = $1
        AND reservation_id = $2
      LIMIT 1
    `,
    [userId, reservationId]
  );

  return rows[0] || null;
};

const listAvailableUnitsForItem = async (userId, itemId, quantity, executor = query) => {
  const { rows } = await executor(
    `
      SELECT *
      FROM product_units
      WHERE user_id = $1
        AND item_id = $2
        AND status = 'available'
      ORDER BY created_at ASC
      LIMIT $3
    `,
    [userId, itemId, quantity]
  );

  if (rows.length < quantity) {
    throw new HttpError(
      409,
      "Toutes les unites suivies ne sont pas disponibles pour valider ce depart."
    );
  }

  return rows;
};

const getProductUnitById = async (userId, unitId, executor = query) => {
  const { rows } = await executor(
    `
      SELECT
        product_units.*,
        items.name AS item_name,
        items.stock AS item_stock,
        assignments.reservation_id AS active_reservation_id,
        assignments.reservation_line_id AS active_reservation_line_id,
        reservations.reference AS active_reservation_reference
      FROM product_units
      INNER JOIN items ON items.id = product_units.item_id
      LEFT JOIN reservation_line_units AS assignments
        ON assignments.product_unit_id = product_units.id
       AND assignments.assignment_status = 'departed'
      LEFT JOIN reservations ON reservations.id = assignments.reservation_id
      WHERE product_units.id = $1
        AND product_units.user_id = $2
      LIMIT 1
    `,
    [unitId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Unite introuvable.");
  }

  return rows[0];
};

export const listProductUnits = async (userId) => {
  const { rows } = await query(
    `
      SELECT
        product_units.*,
        items.name AS item_name,
        items.category AS item_category,
        assignments.reservation_id AS active_reservation_id,
        assignments.reservation_line_id AS active_reservation_line_id,
        reservations.reference AS active_reservation_reference
      FROM product_units
      INNER JOIN items ON items.id = product_units.item_id
      LEFT JOIN reservation_line_units AS assignments
        ON assignments.product_unit_id = product_units.id
       AND assignments.assignment_status = 'departed'
      LEFT JOIN reservations ON reservations.id = assignments.reservation_id
      WHERE product_units.user_id = $1
      ORDER BY items.name ASC, product_units.created_at ASC
    `,
    [userId]
  );

  return rows.map(serializeProductUnit);
};

export const listStockMovements = async (userId, limit = 40) => {
  const { rows } = await query(
    `
      SELECT
        stock_movements.*,
        items.name AS item_name,
        product_units.label AS unit_label,
        reservations.reference AS reservation_reference
      FROM stock_movements
      INNER JOIN items ON items.id = stock_movements.item_id
      LEFT JOIN product_units ON product_units.id = stock_movements.product_unit_id
      LEFT JOIN reservations ON reservations.id = stock_movements.reservation_id
      WHERE stock_movements.user_id = $1
      ORDER BY stock_movements.occurred_at DESC, stock_movements.created_at DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return rows.map(serializeStockMovement);
};

export const getOperationsOverview = async (userId) => {
  const [productUnits, stockMovements] = await Promise.all([
    listProductUnits(userId),
    listStockMovements(userId),
  ]);

  return {
    productUnits,
    stockMovements,
  };
};

export const listUnitsByItem = async (userId, itemId) => {
  await getItemTrackingContext(userId, itemId);

  const { rows } = await query(
    `
      SELECT
        product_units.*,
        items.name AS item_name,
        items.category AS item_category,
        assignments.reservation_id AS active_reservation_id,
        assignments.reservation_line_id AS active_reservation_line_id,
        reservations.reference AS active_reservation_reference
      FROM product_units
      INNER JOIN items ON items.id = product_units.item_id
      LEFT JOIN reservation_line_units AS assignments
        ON assignments.product_unit_id = product_units.id
       AND assignments.assignment_status = 'departed'
      LEFT JOIN reservations ON reservations.id = assignments.reservation_id
      WHERE product_units.user_id = $1
        AND product_units.item_id = $2
      ORDER BY product_units.created_at ASC
    `,
    [userId, itemId]
  );

  return rows.map(serializeProductUnit);
};

export const createProductUnit = async (userId, itemId, payload) => {
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const itemContext = await getItemTrackingContext(userId, itemId, dbClient.query.bind(dbClient));

    if (!itemContext.serial_tracking) {
      throw new HttpError(
        400,
        "Activez d'abord le suivi par unite sur ce produit pour creer des unites."
      );
    }

    const unit = await createSingleProductUnit(
      userId,
      itemContext,
      payload,
      dbClient.query.bind(dbClient)
    );
    await recordDomainEvent(dbClient.query.bind(dbClient), {
      userId,
      aggregateType: "product_unit",
      aggregateId: unit.id,
      eventType: "product_unit.created",
      payload: {
        item_id: itemContext.id,
        item_name: itemContext.name,
        label: unit.label,
        serial_number: unit.serial_number || null,
        status: unit.status,
      },
    });
    await dbClient.query("COMMIT");
    return unit;
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
};

export const generateMissingProductUnits = async (userId, itemId) => {
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const itemContext = await getItemTrackingContext(userId, itemId, dbClient.query.bind(dbClient));

    if (!itemContext.serial_tracking) {
      throw new HttpError(
        400,
        "Activez d'abord le suivi par unite sur ce produit pour generer les unites."
      );
    }

    const existingCount = await getExistingUnitCount(userId, itemId, dbClient.query.bind(dbClient));
    const missingCount = Math.max(itemContext.stock - existingCount, 0);

    for (let index = 0; index < missingCount; index += 1) {
      await createSingleProductUnit(
        userId,
        itemContext,
        {
          label: buildAutoUnitLabel(itemContext.name, existingCount + index + 1),
          status: "available",
        },
        dbClient.query.bind(dbClient)
      );
    }

    await dbClient.query("COMMIT");
    return listUnitsByItem(userId, itemId);
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
};

export const updateProductUnit = async (userId, unitId, payload) => {
  const nextPayload = normalizeUnitPayload(payload);
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const existingUnit = await getProductUnitById(userId, unitId, dbClient.query.bind(dbClient));
    const nextStatus = nextPayload.status || existingUnit.status;
    ensureUnitStatus(nextStatus);

    if (
      existingUnit.status === "out" &&
      nextStatus !== "out" &&
      existingUnit.active_reservation_id
    ) {
      throw new HttpError(
        409,
        "Cette unite est actuellement sortie sur une reservation. Validez d'abord le retour."
      );
    }

      const { rows } = await dbClient.query(
      `
        UPDATE product_units
        SET label = $3,
            serial_number = $4,
            status = $5,
            condition_notes = $6,
            last_known_location = $7
        WHERE id = $1
          AND user_id = $2
        RETURNING *
      `,
      [
        unitId,
        userId,
        nextPayload.label || existingUnit.label,
        nextPayload.serial_number || existingUnit.serial_number || null,
        nextStatus,
        nextPayload.condition_notes || existingUnit.condition_notes || null,
        nextPayload.last_known_location || existingUnit.last_known_location || null,
      ]
    );

      if (existingUnit.status !== nextStatus) {
        await recordStockMovement(dbClient.query.bind(dbClient), {
          userId,
          itemId: existingUnit.item_id,
        productUnitId: unitId,
        movementType: "availability_change",
        quantity: 1,
        fromState: existingUnit.status,
        toState: nextStatus,
          notes: `Statut unite ${rows[0].label}`,
        });
        await recordDomainEvent(dbClient.query.bind(dbClient), {
          userId,
          aggregateType: "product_unit",
          aggregateId: unitId,
          eventType: "product_unit.status_changed",
          payload: {
            item_id: existingUnit.item_id,
            item_name: existingUnit.item_name,
            label: rows[0].label,
            from: existingUnit.status,
            to: nextStatus,
          },
        });
      }

    await dbClient.query("COMMIT");
    return rows[0];
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
};

export const completeReservationDeparture = async (userId, reservationId, payload = {}) => {
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const { reservation, lines } = await getReservationContext(
      userId,
      reservationId,
      dbClient.query.bind(dbClient)
    );
    const operationPayload = normalizeOperationPayload(payload);
    const existingDeparture = await getOperationRecord(
      "reservation_departures",
      userId,
      reservationId,
      dbClient.query.bind(dbClient)
    );
    const existingReturn = await getOperationRecord(
      "reservation_returns",
      userId,
      reservationId,
      dbClient.query.bind(dbClient)
    );

    if (reservation.status === "cancelled") {
      throw new HttpError(409, "Impossible de traiter le depart d'une reservation annulee.");
    }

    if (existingDeparture?.status === "completed") {
      throw new HttpError(409, "Le depart de cette reservation a deja ete valide.");
    }

    if (existingReturn?.status === "completed") {
      throw new HttpError(409, "Le retour de cette reservation a deja ete valide.");
    }

    const processedAt = new Date().toISOString();

    for (const line of lines) {
      if (line.serial_tracking) {
        const availableUnits = await listAvailableUnitsForItem(
          userId,
          line.item_id,
          line.quantity,
          dbClient.query.bind(dbClient)
        );

        for (const unit of availableUnits) {
          await dbClient.query(
            `
              INSERT INTO reservation_line_units (
                id,
                reservation_line_id,
                reservation_id,
                user_id,
                product_unit_id,
                assignment_status,
                assigned_at
              )
              VALUES ($1, $2, $3, $4, $5, 'departed', $6)
            `,
            [
              crypto.randomUUID(),
              line.id,
              reservationId,
              userId,
              unit.id,
              processedAt,
            ]
          );

          await dbClient.query(
            `
              UPDATE product_units
              SET status = 'out',
                  last_known_location = $3
              WHERE id = $1
                AND user_id = $2
            `,
            [
              unit.id,
              userId,
              operationPayload.last_known_location ||
                reservation.reference ||
                reservation.client_name ||
                "En circulation",
            ]
          );

          await recordStockMovement(dbClient.query.bind(dbClient), {
            userId,
            itemId: line.item_id,
            reservationId,
            reservationLineId: line.id,
            productUnitId: unit.id,
            movementType: "departure",
            quantity: 1,
            fromState: unit.status,
            toState: "out",
            notes: operationPayload.notes || `Depart ${reservation.reference || reservationId}`,
            occurredAt: processedAt,
          });
        }

        continue;
      }

      await recordStockMovement(dbClient.query.bind(dbClient), {
        userId,
        itemId: line.item_id,
        reservationId,
        reservationLineId: line.id,
        movementType: "departure",
        quantity: line.quantity,
        fromState: "available",
        toState: "out",
        notes: operationPayload.notes || `Depart ${reservation.reference || reservationId}`,
        occurredAt: processedAt,
      });
    }

    await dbClient.query(
      `
        INSERT INTO reservation_departures (
          reservation_id,
          user_id,
          status,
          processed_at,
          notes
        )
        VALUES ($1, $2, 'completed', $3, $4)
        ON CONFLICT (reservation_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          processed_at = EXCLUDED.processed_at,
          notes = EXCLUDED.notes
      `,
      [reservationId, userId, processedAt, operationPayload.notes || null]
    );
    await recordDomainEvent(dbClient.query.bind(dbClient), {
      userId,
      aggregateType: "reservation",
      aggregateId: reservationId,
      eventType: "reservation.departure_completed",
      payload: buildReservationOperationEventPayload({
        reservation,
        lines,
        processedAt,
        notes: operationPayload.notes,
        lastKnownLocation: operationPayload.last_known_location,
      }),
    });

    await dbClient.query("COMMIT");
    return {
      reservation_id: reservationId,
      status: "completed",
      processed_at: processedAt,
    };
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
};

export const completeReservationReturn = async (userId, reservationId, payload = {}) => {
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const { reservation, lines } = await getReservationContext(
      userId,
      reservationId,
      dbClient.query.bind(dbClient)
    );
    const operationPayload = normalizeOperationPayload(payload);
    const existingDeparture = await getOperationRecord(
      "reservation_departures",
      userId,
      reservationId,
      dbClient.query.bind(dbClient)
    );
    const existingReturn = await getOperationRecord(
      "reservation_returns",
      userId,
      reservationId,
      dbClient.query.bind(dbClient)
    );

    if (reservation.status === "cancelled") {
      throw new HttpError(409, "Impossible de traiter le retour d'une reservation annulee.");
    }

    if (existingReturn?.status === "completed") {
      throw new HttpError(409, "Le retour de cette reservation a deja ete valide.");
    }

    if (existingDeparture?.status !== "completed") {
      throw new HttpError(409, "Validez d'abord le depart avant de traiter le retour.");
    }

    const processedAt = new Date().toISOString();
    const activeAssignments = await listLineAssignments(
      userId,
      reservationId,
      dbClient.query.bind(dbClient)
    );
    const activeAssignmentsByLineId = new Map();

    activeAssignments
      .filter((assignment) => assignment.assignment_status === "departed")
      .forEach((assignment) => {
        const bucket = activeAssignmentsByLineId.get(assignment.reservation_line_id) || [];
        bucket.push(assignment);
        activeAssignmentsByLineId.set(assignment.reservation_line_id, bucket);
      });

    for (const line of lines) {
      if (line.serial_tracking) {
        const lineAssignments = activeAssignmentsByLineId.get(line.id) || [];

        if (!lineAssignments.length) {
          throw new HttpError(
            409,
            "Aucune unite en circulation n'a ete trouvee pour ce retour."
          );
        }

        for (const assignment of lineAssignments) {
          await dbClient.query(
            `
              UPDATE reservation_line_units
              SET assignment_status = 'returned',
                  returned_at = $3
              WHERE id = $1
                AND user_id = $2
            `,
            [assignment.id, userId, processedAt]
          );

          await dbClient.query(
            `
              UPDATE product_units
              SET status = 'available',
                  last_known_location = $3
              WHERE id = $1
                AND user_id = $2
            `,
            [
              assignment.product_unit_id,
              userId,
              operationPayload.last_known_location || "Depot LOKIFY",
            ]
          );

          await recordStockMovement(dbClient.query.bind(dbClient), {
            userId,
            itemId: line.item_id,
            reservationId,
            reservationLineId: line.id,
            productUnitId: assignment.product_unit_id,
            movementType: "return",
            quantity: 1,
            fromState: "out",
            toState: "available",
            notes: operationPayload.notes || `Retour ${reservation.reference || reservationId}`,
            occurredAt: processedAt,
          });
        }

        continue;
      }

      await recordStockMovement(dbClient.query.bind(dbClient), {
        userId,
        itemId: line.item_id,
        reservationId,
        reservationLineId: line.id,
        movementType: "return",
        quantity: line.quantity,
        fromState: "out",
        toState: "available",
        notes: operationPayload.notes || `Retour ${reservation.reference || reservationId}`,
        occurredAt: processedAt,
      });
    }

    await dbClient.query(
      `
        INSERT INTO reservation_returns (
          reservation_id,
          user_id,
          status,
          processed_at,
          notes
        )
        VALUES ($1, $2, 'completed', $3, $4)
        ON CONFLICT (reservation_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          processed_at = EXCLUDED.processed_at,
          notes = EXCLUDED.notes
      `,
      [reservationId, userId, processedAt, operationPayload.notes || null]
    );
    await recordDomainEvent(dbClient.query.bind(dbClient), {
      userId,
      aggregateType: "reservation",
      aggregateId: reservationId,
      eventType: "reservation.return_completed",
      payload: buildReservationOperationEventPayload({
        reservation,
        lines,
        processedAt,
        notes: operationPayload.notes,
        lastKnownLocation: operationPayload.last_known_location || "Depot LOKIFY",
      }),
    });

    await dbClient.query("COMMIT");
    return {
      reservation_id: reservationId,
      status: "completed",
      processed_at: processedAt,
    };
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
};
