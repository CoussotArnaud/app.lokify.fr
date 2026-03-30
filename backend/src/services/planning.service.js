import { listItemProfiles } from "./catalog.service.js";
import { listDeliveryTours } from "./deliveries.service.js";
import { listItems } from "./items.service.js";
import { listProductUnits } from "./operations.service.js";
import { listReservationStatuses } from "./reservation-statuses.service.js";
import { listReservations } from "./reservations.service.js";
import HttpError from "../utils/http-error.js";

const activeAvailabilityStatuses = new Set(["draft", "confirmed", "pending"]);
const blockedItemStatuses = new Set(["maintenance", "unavailable"]);
const blockedUnitStatuses = new Set(["maintenance", "unavailable"]);

const startOfDay = (value) => {
  const nextDate = new Date(value);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
};

const endOfDay = (value) => {
  const nextDate = new Date(value);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
};

const addDays = (value, amount) => {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
};

const toNumber = (value) => Number(value || 0);
const formatDayKey = (value) => new Date(value).toISOString().slice(0, 10);

const overlapsRange = (startValue, endValue, rangeStart, rangeEnd) => {
  const startDate = new Date(startValue);
  const endDate = new Date(endValue);

  return startDate <= rangeEnd && endDate >= rangeStart;
};

const buildDefaultRange = () => {
  const start = startOfDay(new Date());
  const end = endOfDay(addDays(start, 6));

  return { start, end };
};

const buildDayRange = (startDate, endDate) => {
  const days = [];
  let cursor = startOfDay(startDate);
  const finalDate = endOfDay(endDate);

  while (cursor <= finalDate) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
};

const buildStatusMetaMap = (statuses) =>
  statuses.reduce((accumulator, status) => {
    accumulator[status.code] = {
      label: status.label,
      color: status.color,
      position: Number(status.position || 0),
    };
    return accumulator;
  }, {});

const buildProductSnapshots = ({ items, itemProfiles, productUnits }) => {
  const profilesByItemId = new Map(itemProfiles.map((profile) => [profile.item_id, profile]));
  const unitsByItemId = productUnits.reduce((accumulator, unit) => {
    const currentUnits = accumulator.get(unit.item_id) || [];
    currentUnits.push(unit);
    accumulator.set(unit.item_id, currentUnits);
    return accumulator;
  }, new Map());

  return items.map((item) => {
    const profile = profilesByItemId.get(item.id) || null;
    const units = unitsByItemId.get(item.id) || [];
    const serialTracking = Boolean(profile?.serial_tracking);
    const blockedUnits = units.filter((unit) => blockedUnitStatuses.has(unit.status));
    const availableUnits = units.filter((unit) => unit.status === "available");
    const outUnits = units.filter((unit) => unit.status === "out");
    const trackedCapacity = serialTracking && units.length > 0 ? units.length : null;
    const totalCapacity =
      trackedCapacity !== null ? trackedCapacity : toNumber(item.stock);
    const usableCapacity =
      trackedCapacity !== null
        ? Math.max(0, trackedCapacity - blockedUnits.length)
        : blockedItemStatuses.has(item.status)
          ? 0
          : toNumber(item.stock);

    return {
      id: item.id,
      name: item.name,
      category: item.category || "Catalogue",
      status: item.status || "available",
      stock: toNumber(item.stock),
      serial_tracking: serialTracking,
      total_capacity: totalCapacity,
      usable_capacity: usableCapacity,
      tracked_units: units.length,
      available_units: availableUnits.length,
      out_units: outUnits.length,
      blocked_units: blockedUnits.length,
      needs_unit_sync: Boolean(serialTracking && units.length === 0 && toNumber(item.stock) > 0),
      category_slug: profile?.category_slug || "",
      category_name: profile?.category_name || item.category || "Catalogue",
      online_visible: Boolean(profile?.online_visible),
      public_name: profile?.public_name || item.name,
      availability_note: profile?.availability_note || "",
    };
  });
};

const serializePlanningDeliveries = (tours) =>
  tours.map((tour) => ({
    id: tour.id,
    name: tour.name,
    driver: tour.driver || "",
    area: tour.area || "",
    status: tour.status,
    date: tour.date,
    notes: tour.notes || "",
    stops_count: Array.isArray(tour.stops) ? tour.stops.length : 0,
    assignments: Array.isArray(tour.reservations)
      ? tour.reservations.map((assignment) => ({
          id: assignment.id,
          reservation_id: assignment.reservation_id,
          assignment_type: assignment.assignment_type,
          client_name: assignment.client_name,
          item_name: assignment.item_name,
          stop_label: assignment.stop_label || assignment.client_name,
          stop_address: assignment.stop_address || assignment.client_address || "",
          scheduled_slot: assignment.scheduled_slot || "",
          status: assignment.status,
        }))
      : [],
  }));

const buildLinkedDeliveriesByReservationId = (deliveries) => {
  const linkedDeliveriesByReservationId = new Map();

  deliveries.forEach((delivery) => {
    delivery.assignments.forEach((assignment) => {
      const currentAssignments = linkedDeliveriesByReservationId.get(assignment.reservation_id) || [];
      currentAssignments.push({
        tour_id: delivery.id,
        tour_name: delivery.name,
        tour_status: delivery.status,
        assignment_id: assignment.id,
        assignment_type: assignment.assignment_type,
        scheduled_for: delivery.date,
        scheduled_slot: assignment.scheduled_slot,
        stop_label: assignment.stop_label,
        stop_address: assignment.stop_address,
      });
      linkedDeliveriesByReservationId.set(assignment.reservation_id, currentAssignments);
    });
  });

  return linkedDeliveriesByReservationId;
};

const serializePlanningReservation = (reservation, statusMetaMap, linkedDeliveries) => ({
  id: reservation.id,
  reference: reservation.reference,
  client_id: reservation.client_id,
  client_name: reservation.client_name || "Client indisponible",
  status: reservation.status,
  status_label: statusMetaMap[reservation.status]?.label || reservation.status,
  status_color: statusMetaMap[reservation.status]?.color || "#7A869A",
  start_date: reservation.start_date,
  end_date: reservation.end_date,
  item_name: reservation.item_name,
  primary_item_name: reservation.primary_item_name || reservation.item_name,
  category: reservation.category || "Catalogue",
  total_amount: toNumber(reservation.total_amount),
  total_quantity: toNumber(reservation.total_quantity),
  total_deposit: toNumber(reservation.total_deposit),
  line_count: toNumber(reservation.line_count),
  source: reservation.source || "manual",
  fulfillment_mode: reservation.fulfillment_mode || "pickup",
  departure_tracking: reservation.departure_tracking || null,
  return_tracking: reservation.return_tracking || null,
  deposit_tracking: reservation.deposit_tracking || null,
  deliveries: linkedDeliveries.get(reservation.id) || [],
  lines: Array.isArray(reservation.lines)
    ? reservation.lines.map((line) => ({
        id: line.id,
        item_id: line.item_id,
        item_name: line.item_name,
        item_category: line.item_category,
        quantity: toNumber(line.quantity),
        unit_price: toNumber(line.unit_price),
        line_total: toNumber(line.line_total),
        assigned_units: Array.isArray(line.assigned_units) ? line.assigned_units : [],
      }))
    : [],
});

const buildAvailabilityEntry = (product, activeReservationsForDay) => {
  const linkedReservationIds = [];
  let reservedQuantity = 0;

  activeReservationsForDay.forEach((reservation) => {
    reservation.lines.forEach((line) => {
      if (line.item_id !== product.id) {
        return;
      }

      reservedQuantity += toNumber(line.quantity);
      linkedReservationIds.push(reservation.id);
    });
  });

  const availableQuantity = Math.max(0, product.usable_capacity - reservedQuantity);
  const shortageQuantity = Math.max(0, reservedQuantity - product.usable_capacity);
  const lowThreshold = product.usable_capacity <= 3 ? 0 : Math.ceil(product.usable_capacity * 0.2);

  return {
    item_id: product.id,
    item_name: product.name,
    category: product.category,
    tracking_mode: product.serial_tracking ? "unit" : "stock",
    total_capacity: product.total_capacity,
    usable_capacity: product.usable_capacity,
    reserved_quantity: reservedQuantity,
    available_quantity: availableQuantity,
    shortage_quantity: shortageQuantity,
    blocked_units: product.blocked_units,
    needs_unit_sync: product.needs_unit_sync,
    is_low: shortageQuantity > 0 || availableQuantity <= lowThreshold,
    reservation_ids: [...new Set(linkedReservationIds)],
  };
};

export const getPlanning = async (userId, { start, end }) => {
  const defaultRange = buildDefaultRange();
  const startDate = start ? new Date(start) : defaultRange.start;
  const endDate = end ? new Date(end) : defaultRange.end;

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    throw new HttpError(400, "Periode de planning invalide.");
  }

  const normalizedStart = startOfDay(startDate);
  const normalizedEnd = endOfDay(endDate);

  const [statuses, reservations, deliveryTours, items, itemProfiles, productUnits] = await Promise.all([
    listReservationStatuses(userId),
    listReservations(userId),
    listDeliveryTours(userId),
    listItems(userId),
    listItemProfiles(userId),
    listProductUnits(userId),
  ]);

  const statusMetaMap = buildStatusMetaMap(statuses);
  const productSnapshots = buildProductSnapshots({
    items,
    itemProfiles,
    productUnits,
  }).sort((left, right) => left.name.localeCompare(right.name, "fr"));

  const filteredReservations = reservations
    .filter((reservation) =>
      overlapsRange(reservation.start_date, reservation.end_date, normalizedStart, normalizedEnd)
    )
    .sort((left, right) => new Date(left.start_date) - new Date(right.start_date));

  const filteredDeliveries = serializePlanningDeliveries(
    deliveryTours
      .filter((tour) => {
        const tourDate = new Date(tour.date);
        return tourDate >= normalizedStart && tourDate <= normalizedEnd;
      })
      .sort((left, right) => new Date(left.date) - new Date(right.date))
  );

  const linkedDeliveriesByReservationId = buildLinkedDeliveriesByReservationId(filteredDeliveries);
  const planningReservations = filteredReservations.map((reservation) =>
    serializePlanningReservation(reservation, statusMetaMap, linkedDeliveriesByReservationId)
  );

  const dayRange = buildDayRange(normalizedStart, normalizedEnd);
  const dayRows = dayRange.map((day) => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const reservationsForDay = planningReservations.filter((reservation) =>
      overlapsRange(reservation.start_date, reservation.end_date, dayStart, dayEnd)
    );
    const activeReservationsForDay = reservationsForDay.filter((reservation) =>
      activeAvailabilityStatuses.has(reservation.status)
    );
    const deliveriesForDay = filteredDeliveries.filter(
      (delivery) => formatDayKey(delivery.date) === formatDayKey(day)
    );
    const productAvailability = productSnapshots
      .map((product) => buildAvailabilityEntry(product, activeReservationsForDay))
      .sort((left, right) => {
        if (left.available_quantity !== right.available_quantity) {
          return left.available_quantity - right.available_quantity;
        }

        return left.item_name.localeCompare(right.item_name, "fr");
      });

    return {
      date: formatDayKey(day),
      reservation_ids: reservationsForDay.map((reservation) => reservation.id),
      delivery_ids: deliveriesForDay.map((delivery) => delivery.id),
      delivery_assignment_count: deliveriesForDay.reduce(
        (sum, delivery) => sum + delivery.assignments.length,
        0
      ),
      summary: {
        reservations: reservationsForDay.length,
        deliveries: deliveriesForDay.length,
        low_availability_products: productAvailability.filter((entry) => entry.is_low).length,
      },
      products: productAvailability,
    };
  });

  const productsUnderPressure = new Set();
  dayRows.forEach((day) => {
    day.products.forEach((product) => {
      if (product.is_low) {
        productsUnderPressure.add(product.item_id);
      }
    });
  });

  return {
    start: normalizedStart.toISOString(),
    end: normalizedEnd.toISOString(),
    generated_at: new Date().toISOString(),
    statuses,
    metrics: {
      reservations: planningReservations.length,
      deliveries: filteredDeliveries.length,
      low_availability_products: productsUnderPressure.size,
      tracked_products: productSnapshots.filter((product) => product.serial_tracking).length,
    },
    products: productSnapshots,
    reservations: planningReservations,
    deliveries: filteredDeliveries,
    days: dayRows,
  };
};
