import crypto from "crypto";

import { pool, query } from "../config/db.js";
import { recordDomainEvent } from "./domain-events.service.js";
import HttpError from "../utils/http-error.js";

const allowedTourStatuses = new Set(["draft", "planned", "in_progress", "completed"]);
const allowedAssignmentTypes = new Set(["delivery", "return", "pickup"]);
const allowedStopKinds = new Set(["depot", "delivery", "return", "pickup", "custom"]);
const buildAssignmentKey = (reservationId, assignmentType) => `${reservationId}:${assignmentType}`;

const normalizeTourPayload = (payload = {}) => ({
  name: String(payload.name ?? "").trim(),
  driver: String(payload.driver ?? "").trim(),
  area: String(payload.area ?? "").trim(),
  date: String(payload.date ?? payload.scheduled_for ?? "").trim(),
  status: String(payload.status ?? "").trim(),
  notes: String(payload.notes ?? "").trim(),
  assignments: Array.isArray(payload.assignments) ? payload.assignments : [],
});

const normalizeAssignmentPayload = (payload = {}) => ({
  reservation_id: String(payload.reservation_id ?? payload.reservationId ?? "").trim(),
  assignment_type:
    String(payload.assignment_type ?? payload.assignmentType ?? "delivery").trim() || "delivery",
  stop_label: String(payload.stop_label ?? payload.stopLabel ?? "").trim(),
  stop_address: String(payload.stop_address ?? payload.stopAddress ?? "").trim(),
  scheduled_slot: String(payload.scheduled_slot ?? payload.scheduledSlot ?? "").trim(),
});

const buildTourEventPayload = ({ tourId, payload, assignmentCount }) => ({
  name: payload.name,
  driver: payload.driver || null,
  area: payload.area,
  scheduled_for: payload.date,
  status: payload.status || (assignmentCount ? "planned" : "draft"),
  notes: payload.notes || null,
  assignment_count: assignmentCount,
  tour_id: tourId,
});

const ensureTour = async (userId, tourId, executor = query) => {
  const { rows } = await executor(
    `
      SELECT *
      FROM delivery_tours
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [tourId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Tournee introuvable.");
  }

  return rows[0];
};

const buildSqlPlaceholders = (values, startIndex = 1) =>
  values.map((_, index) => `$${index + startIndex}`).join(", ");

const formatSlotFromDate = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(11, 16);
};

const getAssignmentLabel = ({ assignmentType, reservation }) => {
  const suffix = assignmentType === "return" ? "Retour" : assignmentType === "pickup" ? "Enlevement" : "Livraison";
  return `${reservation.client_name} - ${suffix}`;
};

const getAssignmentSlot = ({ assignmentType, reservation, payload }) => {
  if (payload.scheduled_slot) {
    return payload.scheduled_slot;
  }

  if (assignmentType === "return") {
    return formatSlotFromDate(reservation.end_date) || "17:00";
  }

  return formatSlotFromDate(reservation.start_date) || "09:00";
};

const listReservationContexts = async (userId, reservationIds, executor = query) => {
  const uniqueReservationIds = [...new Set(reservationIds.filter(Boolean))];

  if (!uniqueReservationIds.length) {
    return [];
  }

  const { rows } = await executor(
    `
      SELECT
        reservations.*,
        clients.first_name || ' ' || clients.last_name AS client_name,
        clients.address AS client_address,
        COALESCE(items.name, 'Produit indisponible') AS primary_item_name
      FROM reservations
      INNER JOIN clients ON clients.id = reservations.client_id
      LEFT JOIN items ON items.id = reservations.item_id
      WHERE reservations.user_id = $1
        AND reservations.id IN (${buildSqlPlaceholders(uniqueReservationIds, 2)})
    `,
    [userId, ...uniqueReservationIds]
  );

  return rows;
};

const listExistingAssignmentsRows = async (
  userId,
  reservationIds,
  executor = query,
  excludedTourId = null
) => {
  const uniqueReservationIds = [...new Set(reservationIds.filter(Boolean))];

  if (!uniqueReservationIds.length) {
    return [];
  }

  const values = [userId, ...uniqueReservationIds];
  let excludedTourClause = "";

  if (excludedTourId) {
    values.push(excludedTourId);
    excludedTourClause = `AND tour_id <> $${values.length}`;
  }

  const { rows } = await executor(
    `
      SELECT *
      FROM delivery_assignments
      WHERE user_id = $1
        AND reservation_id IN (${buildSqlPlaceholders(uniqueReservationIds, 2)})
        ${excludedTourClause}
    `,
    values
  );

  return rows;
};

const listDeliveryToursRows = async (userId, executor = query) => {
  const { rows } = await executor(
    `
      SELECT *
      FROM delivery_tours
      WHERE user_id = $1
      ORDER BY scheduled_for ASC, created_at ASC
    `,
    [userId]
  );

  return rows;
};

const listDeliveryAssignmentsRows = async (userId, executor = query) => {
  const { rows } = await executor(
    `
      SELECT
        delivery_assignments.*,
        reservations.reference AS reservation_reference,
        reservations.start_date,
        reservations.end_date,
        reservations.fulfillment_mode,
        clients.first_name || ' ' || clients.last_name AS client_name,
        clients.address AS client_address,
        COALESCE(items.name, 'Produit indisponible') AS primary_item_name
      FROM delivery_assignments
      INNER JOIN reservations ON reservations.id = delivery_assignments.reservation_id
      INNER JOIN clients ON clients.id = reservations.client_id
      LEFT JOIN items ON items.id = reservations.item_id
      WHERE delivery_assignments.user_id = $1
      ORDER BY delivery_assignments.sort_order ASC, delivery_assignments.created_at ASC
    `,
    [userId]
  );

  return rows;
};

const listDeliveryStopsRows = async (userId, executor = query) => {
  const { rows } = await executor(
    `
      SELECT
        delivery_stops.*,
        delivery_assignments.assignment_type,
        delivery_assignments.reservation_id,
        reservations.reference AS reservation_reference,
        clients.first_name || ' ' || clients.last_name AS client_name
      FROM delivery_stops
      LEFT JOIN delivery_assignments ON delivery_assignments.id = delivery_stops.assignment_id
      LEFT JOIN reservations ON reservations.id = delivery_assignments.reservation_id
      LEFT JOIN clients ON clients.id = reservations.client_id
      WHERE delivery_stops.user_id = $1
      ORDER BY delivery_stops.sort_order ASC, delivery_stops.created_at ASC
    `,
    [userId]
  );

  return rows;
};

const serializeTours = ({ tours, assignments, stops }) =>
  tours.map((tour) => {
    const tourAssignments = assignments
      .filter((assignment) => assignment.tour_id === tour.id)
      .map((assignment) => ({
        id: assignment.id,
        reservation_id: assignment.reservation_id,
        assignment_type: assignment.assignment_type,
        status: assignment.status,
        sort_order: Number(assignment.sort_order || 0),
        reference: assignment.reservation_reference || "",
        client_name: assignment.client_name || "Client indisponible",
        client_address: assignment.client_address || "",
        item_name: assignment.primary_item_name || "Produit indisponible",
        fulfillment_mode: assignment.fulfillment_mode || "pickup",
        scheduled_slot: assignment.scheduled_slot || "",
        stop_label: assignment.stop_label,
        stop_address: assignment.stop_address || "",
        start_date: assignment.start_date,
        end_date: assignment.end_date,
      }));

    const tourStops = stops
      .filter((stop) => stop.tour_id === tour.id)
      .map((stop) => ({
        id: stop.id,
        assignment_id: stop.assignment_id || null,
        kind: stop.stop_kind,
        label: stop.label,
        address: stop.address || "",
        scheduled_slot: stop.scheduled_slot || "",
        status: stop.status,
        sort_order: Number(stop.sort_order || 0),
        notes: stop.notes || "",
        assignment_type: stop.assignment_type || null,
        reservation_id: stop.reservation_id || null,
        reservation_reference: stop.reservation_reference || "",
        client_name: stop.client_name || "",
      }));

    return {
      id: tour.id,
      name: tour.name,
      driver: tour.driver || "",
      area: tour.area,
      date: tour.scheduled_for,
      status: tour.status,
      notes: tour.notes || "",
      reservations: tourAssignments,
      stops: tourStops,
    };
  });

const validateAssignments = async ({
  userId,
  assignments,
  executor = query,
  excludedTourId = null,
}) => {
  const duplicatedAssignments = new Set();

  assignments.forEach((assignment) => {
    if (!assignment.reservation_id) {
      throw new HttpError(400, "Une affectation de tournee reference une reservation invalide.");
    }

    if (!allowedAssignmentTypes.has(assignment.assignment_type)) {
      throw new HttpError(400, "Type d'affectation invalide.");
    }

    const duplicateKey = buildAssignmentKey(assignment.reservation_id, assignment.assignment_type);
    if (duplicatedAssignments.has(duplicateKey)) {
      throw new HttpError(409, "Une meme reservation ne peut etre affectee deux fois au meme type de stop.");
    }

    duplicatedAssignments.add(duplicateKey);
  });

  const reservationContexts = await listReservationContexts(
    userId,
    assignments.map((assignment) => assignment.reservation_id),
    executor
  );
  const reservationsById = new Map(reservationContexts.map((reservation) => [reservation.id, reservation]));

  assignments.forEach((assignment) => {
    const reservation = reservationsById.get(assignment.reservation_id);
    if (!reservation) {
      throw new HttpError(404, "Reservation introuvable pour cette affectation.");
    }

    if (reservation.status === "cancelled") {
      throw new HttpError(409, "Les reservations annulees ne peuvent pas etre ajoutees a une tournee.");
    }
  });

  const existingAssignments = await listExistingAssignmentsRows(
    userId,
    assignments.map((assignment) => assignment.reservation_id),
    executor,
    excludedTourId
  );

  const existingAssignmentByKey = new Map(
    existingAssignments.map((assignment) => [
      buildAssignmentKey(assignment.reservation_id, assignment.assignment_type),
      assignment,
    ])
  );

  assignments.forEach((assignment) => {
    const existingAssignment = existingAssignmentByKey.get(
      buildAssignmentKey(assignment.reservation_id, assignment.assignment_type)
    );

    if (existingAssignment) {
      throw new HttpError(
        409,
        "Cette affectation est deja planifiee dans une autre tournee."
      );
    }
  });

  return reservationsById;
};

const insertStop = async (
  executor,
  {
    userId,
    tourId,
    assignmentId = null,
    stopKind,
    label,
    address,
    scheduledSlot,
    sortOrder,
    notes = "",
  }
) => {
  if (!allowedStopKinds.has(stopKind)) {
    throw new HttpError(400, "Type d'arret invalide.");
  }

  await executor(
    `
      INSERT INTO delivery_stops (
        id,
        tour_id,
        user_id,
        assignment_id,
        stop_kind,
        label,
        address,
        scheduled_slot,
        status,
        sort_order,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'planned', $9, $10)
    `,
    [
      crypto.randomUUID(),
      tourId,
      userId,
      assignmentId,
      stopKind,
      label,
      address || null,
      scheduledSlot || null,
      sortOrder,
      notes || null,
    ]
  );
};

const rebuildTourAssignments = async (
  executor,
  {
    userId,
    tourId,
    area,
    notes = "",
    assignments,
    reservationsById,
  }
) => {
  await executor(
    `
      DELETE FROM delivery_stops
      WHERE tour_id = $1
        AND user_id = $2
    `,
    [tourId, userId]
  );
  await executor(
    `
      DELETE FROM delivery_assignments
      WHERE tour_id = $1
        AND user_id = $2
    `,
    [tourId, userId]
  );

  await insertStop(executor, {
    userId,
    tourId,
    stopKind: "depot",
    label: "Preparation depot",
    address: "Depot LOKIFY",
    scheduledSlot: "07:30",
    sortOrder: 0,
    notes,
  });

  if (!assignments.length) {
    await insertStop(executor, {
      userId,
      tourId,
      stopKind: "custom",
      label: "Zone a confirmer",
      address: area,
      scheduledSlot: "11:00",
      sortOrder: 1,
    });
    return;
  }

  for (const [index, assignment] of assignments.entries()) {
    const reservation = reservationsById.get(assignment.reservation_id);
    const assignmentId = crypto.randomUUID();
    const assignmentType = assignment.assignment_type;
    const stopLabel = assignment.stop_label || getAssignmentLabel({ assignmentType, reservation });
    const stopAddress = assignment.stop_address || reservation.client_address || area;
    const scheduledSlot = getAssignmentSlot({
      assignmentType,
      reservation,
      payload: assignment,
    });
    const sortOrder = index + 1;

    await executor(
      `
        INSERT INTO delivery_assignments (
          id,
          tour_id,
          user_id,
          reservation_id,
          assignment_type,
          stop_label,
          stop_address,
          scheduled_slot,
          status,
          sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'planned', $9)
      `,
      [
        assignmentId,
        tourId,
        userId,
        reservation.id,
        assignmentType,
        stopLabel,
        stopAddress || null,
        scheduledSlot || null,
        sortOrder,
      ]
    );

    await insertStop(executor, {
      userId,
      tourId,
      assignmentId,
      stopKind: assignmentType === "pickup" ? "pickup" : assignmentType,
      label: stopLabel,
      address: stopAddress,
      scheduledSlot,
      sortOrder,
    });
  }
};

export const listDeliveryTours = async (userId) => {
  const [tours, assignments, stops] = await Promise.all([
    listDeliveryToursRows(userId),
    listDeliveryAssignmentsRows(userId),
    listDeliveryStopsRows(userId),
  ]);

  return serializeTours({ tours, assignments, stops });
};

export const getDeliveryOverview = async (userId) => {
  const tours = await listDeliveryTours(userId);
  return { tours };
};

export const createDeliveryTour = async (userId, payload = {}) => {
  const nextPayload = normalizeTourPayload(payload);
  const nextAssignments = nextPayload.assignments.map(normalizeAssignmentPayload);
  let createdTourId = null;

  if (!nextPayload.name) {
    throw new HttpError(400, "Le nom de la tournee est obligatoire.");
  }

  if (!nextPayload.area) {
    throw new HttpError(400, "La zone de la tournee est obligatoire.");
  }

  const scheduledDate = new Date(nextPayload.date);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new HttpError(400, "La date de la tournee est invalide.");
  }

  if (nextPayload.status && !allowedTourStatuses.has(nextPayload.status)) {
    throw new HttpError(400, "Statut de tournee invalide.");
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const reservationContextsById = await validateAssignments({
      userId,
      assignments: nextAssignments,
      executor: dbClient.query.bind(dbClient),
    });

    const tourId = crypto.randomUUID();
    createdTourId = tourId;
    await dbClient.query(
      `
        INSERT INTO delivery_tours (
          id,
          user_id,
          name,
          driver,
          area,
          scheduled_for,
          status,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        tourId,
        userId,
        nextPayload.name,
        nextPayload.driver || null,
        nextPayload.area,
        scheduledDate.toISOString(),
        nextPayload.status || (nextAssignments.length ? "planned" : "draft"),
        nextPayload.notes || null,
      ]
    );
      await rebuildTourAssignments(dbClient.query.bind(dbClient), {
        userId,
        tourId,
        area: nextPayload.area,
        notes: nextPayload.notes,
        assignments: nextAssignments,
        reservationsById: reservationContextsById,
      });
      await recordDomainEvent(dbClient.query.bind(dbClient), {
        userId,
        aggregateType: "delivery_tour",
        aggregateId: tourId,
        eventType: "delivery_tour.created",
        payload: buildTourEventPayload({
          tourId,
          payload: nextPayload,
          assignmentCount: nextAssignments.length,
        }),
      });

      await dbClient.query("COMMIT");
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }

  const tours = await listDeliveryTours(userId);
  return tours.find((tour) => tour.id === createdTourId) || tours[tours.length - 1];
};

export const updateDeliveryTour = async (userId, tourId, payload = {}) => {
  const nextPayload = normalizeTourPayload(payload);
  const nextAssignments = nextPayload.assignments.map(normalizeAssignmentPayload);
  const scheduledDate = new Date(nextPayload.date);

  if (!nextPayload.name) {
    throw new HttpError(400, "Le nom de la tournee est obligatoire.");
  }

  if (!nextPayload.area) {
    throw new HttpError(400, "La zone de la tournee est obligatoire.");
  }

  if (Number.isNaN(scheduledDate.getTime())) {
    throw new HttpError(400, "La date de la tournee est invalide.");
  }

  if (nextPayload.status && !allowedTourStatuses.has(nextPayload.status)) {
    throw new HttpError(400, "Statut de tournee invalide.");
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const existingTour = await ensureTour(userId, tourId, dbClient.query.bind(dbClient));
    const reservationContextsById = await validateAssignments({
      userId,
      assignments: nextAssignments,
      executor: dbClient.query.bind(dbClient),
      excludedTourId: tourId,
    });

    await dbClient.query(
      `
        UPDATE delivery_tours
        SET name = $3,
            driver = $4,
            area = $5,
            scheduled_for = $6,
            status = $7,
            notes = $8,
            updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
      `,
      [
        tourId,
        userId,
        nextPayload.name,
        nextPayload.driver || null,
        nextPayload.area,
        scheduledDate.toISOString(),
        nextPayload.status || existingTour.status,
        nextPayload.notes || null,
      ]
    );

      await rebuildTourAssignments(dbClient.query.bind(dbClient), {
        userId,
        tourId,
        area: nextPayload.area,
        notes: nextPayload.notes,
        assignments: nextAssignments,
        reservationsById: reservationContextsById,
      });
      await recordDomainEvent(dbClient.query.bind(dbClient), {
        userId,
        aggregateType: "delivery_tour",
        aggregateId: tourId,
        eventType: "delivery_tour.updated",
        payload: buildTourEventPayload({
          tourId,
          payload: nextPayload,
          assignmentCount: nextAssignments.length,
        }),
      });

      await dbClient.query("COMMIT");
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }

  const tours = await listDeliveryTours(userId);
  return tours.find((tour) => tour.id === tourId);
};

export const deleteDeliveryTour = async (userId, tourId) => {
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const existingTour = await ensureTour(userId, tourId, dbClient.query.bind(dbClient));
    await dbClient.query(
      `
        DELETE FROM delivery_tours
        WHERE id = $1
          AND user_id = $2
      `,
      [tourId, userId]
    );
    await recordDomainEvent(dbClient.query.bind(dbClient), {
      userId,
      aggregateType: "delivery_tour",
      aggregateId: tourId,
      eventType: "delivery_tour.deleted",
      payload: {
        name: existingTour.name,
        area: existingTour.area,
        scheduled_for: existingTour.scheduled_for,
        status: existingTour.status,
      },
    });
    await dbClient.query("COMMIT");
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }

  return { success: true };
};

export const moveDeliveryStop = async (userId, tourId, stopId, direction) => {
  if (!["up", "down"].includes(direction)) {
    throw new HttpError(400, "Direction de deplacement invalide.");
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    await ensureTour(userId, tourId, dbClient.query.bind(dbClient));

    const { rows: stopRows } = await dbClient.query(
      `
        SELECT *
        FROM delivery_stops
        WHERE user_id = $1
          AND tour_id = $2
        ORDER BY sort_order ASC, created_at ASC
      `,
      [userId, tourId]
    );

    const currentIndex = stopRows.findIndex((stop) => stop.id === stopId);
    if (currentIndex === -1) {
      throw new HttpError(404, "Arret introuvable pour cette tournee.");
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= stopRows.length) {
      await dbClient.query("COMMIT");
      const tours = await listDeliveryTours(userId);
      return tours.find((tour) => tour.id === tourId);
    }

    [stopRows[currentIndex], stopRows[targetIndex]] = [stopRows[targetIndex], stopRows[currentIndex]];

    for (const [index, stop] of stopRows.entries()) {
      await dbClient.query(
        `
          UPDATE delivery_stops
          SET sort_order = $3,
              updated_at = NOW()
          WHERE id = $1
            AND user_id = $2
        `,
        [stop.id, userId, index]
      );

      if (stop.assignment_id) {
        await dbClient.query(
          `
            UPDATE delivery_assignments
            SET sort_order = $3,
                updated_at = NOW()
            WHERE id = $1
              AND user_id = $2
          `,
          [stop.assignment_id, userId, index]
        );
      }
    }

    await dbClient.query("COMMIT");
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }

  const tours = await listDeliveryTours(userId);
  return tours.find((tour) => tour.id === tourId);
};
