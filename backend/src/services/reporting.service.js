import crypto from "crypto";

import { query } from "../config/db.js";
import { listItemProfiles } from "./catalog.service.js";
import { listDeliveryTours } from "./deliveries.service.js";
import { listItems } from "./items.service.js";
import { listProductUnits } from "./operations.service.js";
import { listReservationStatuses } from "./reservation-statuses.service.js";
import { listReservations } from "./reservations.service.js";
import HttpError from "../utils/http-error.js";

const allowedWindows = new Set([7, 30, 90]);
const revenueStatuses = new Set(["confirmed", "completed"]);
const activeOperationalStatuses = new Set(["draft", "pending", "confirmed"]);
const blockedUnitStatuses = new Set(["maintenance", "unavailable"]);
const blockedItemStatuses = new Set(["maintenance", "unavailable"]);

const documentDefinitions = [
  {
    type: "quote",
    title: "Devis",
    prefix: "DEV",
  },
  {
    type: "contract",
    title: "Contrat",
    prefix: "CTR",
  },
  {
    type: "inventory",
    title: "Etat des lieux",
    prefix: "ETL",
  },
  {
    type: "invoice",
    title: "Facture",
    prefix: "FAC",
  },
];

const documentStatusMeta = {
  quote: {
    draft: { label: "A valider", tone: "warning" },
    validated: { label: "Pret", tone: "success" },
    cancelled: { label: "Annule", tone: "danger" },
  },
  contract: {
    pending: { label: "En preparation", tone: "neutral" },
    to_sign: { label: "A signer", tone: "info" },
    archived: { label: "Archive", tone: "success" },
    cancelled: { label: "Annule", tone: "danger" },
  },
  inventory: {
    planned: { label: "A planifier", tone: "warning" },
    circulating: { label: "En circulation", tone: "info" },
    archived: { label: "Archive", tone: "success" },
    cancelled: { label: "Annule", tone: "danger" },
  },
  invoice: {
    pending: { label: "En preparation", tone: "neutral" },
    due: { label: "A regler", tone: "warning" },
    cancelled: { label: "Annule", tone: "danger" },
  },
};

const cashStatusMeta = {
  revenue_pending: { label: "En attente", tone: "neutral" },
  revenue_to_collect: { label: "A encaisser", tone: "warning" },
  revenue_cancelled: { label: "Annule", tone: "danger" },
  deposit_to_collect: { label: "A recuperer", tone: "warning" },
  deposit_blocked: { label: "Bloquee", tone: "warning" },
  deposit_to_release: { label: "A restituer", tone: "info" },
  deposit_released: { label: "Restituee", tone: "success" },
  deposit_waived: { label: "Abandonnee", tone: "danger" },
};

const toNumber = (value) => Number(value || 0);
const parseJsonObject = (value) => {
  try {
    return JSON.parse(value || "{}");
  } catch (_error) {
    return {};
  }
};

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

const formatDayLabel = (value) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));

const buildWindowRange = (rawWindow) => {
  const parsedWindow = Number(rawWindow || 30);
  const windowDays = allowedWindows.has(parsedWindow) ? parsedWindow : 30;
  const end = endOfDay(new Date());
  const start = startOfDay(addDays(end, 1 - windowDays));

  return { windowDays, start, end };
};

const isWithinRange = (value, start, end) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date >= start && date <= end;
};

const buildDocumentReference = (prefix, reservationReference) => {
  const referenceSuffix = String(reservationReference || "")
    .replace(/[^A-Z0-9]/gi, "")
    .slice(-8)
    .toUpperCase();

  return `${prefix}-${referenceSuffix || crypto.randomUUID().slice(0, 8).toUpperCase()}`;
};

const formatDocumentDateTime = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date a confirmer";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const serializeDateTime = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeInlineText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeFreeText = (value) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();

const buildDocumentLineSummary = (reservation) => {
  const lines = Array.isArray(reservation.lines) ? reservation.lines : [];

  if (!lines.length) {
    return "- Produit a confirmer";
  }

  return lines
    .map((line) => `- ${line.item_name}${toNumber(line.quantity) > 1 ? ` x${line.quantity}` : ""}`)
    .join("\n");
};

const buildDocumentContentText = (reservation, definition) => {
  const fulfillmentLabel =
    reservation.fulfillment_mode === "delivery"
      ? "Livraison"
      : reservation.fulfillment_mode === "onsite"
        ? "Intervention sur site"
        : "Retrait depot";
  const depositLabel =
    toNumber(reservation.total_deposit) > 0
      ? `${toNumber(reservation.total_deposit).toFixed(2)} EUR`
      : "Aucune caution";

  const commonHeader = [
    definition.title.toUpperCase(),
    `Reservation : ${reservation.reference}`,
    `Client : ${reservation.client_name || "Client a confirmer"}`,
    `Periode : du ${formatDocumentDateTime(reservation.start_date)} au ${formatDocumentDateTime(reservation.end_date)}`,
    `Logistique : ${fulfillmentLabel}`,
    "",
    "Produits / prestations",
    buildDocumentLineSummary(reservation),
    "",
    `Montant location : ${toNumber(reservation.total_amount).toFixed(2)} EUR`,
    `Caution separee : ${depositLabel}`,
    "",
  ];

  if (definition.type === "quote") {
    return [
      ...commonHeader,
      "Objet",
      "Preparation du devis pour validation client. Les conditions tarifaires et logistiques restent modifiables.",
      "",
      "Notes commerciales",
      "Ajouter ici les options, remarques ou conditions particulieres si necessaire.",
    ].join("\n");
  }

  if (definition.type === "contract") {
    return [
      ...commonHeader,
      "Objet",
      "Contrat de location prepare a partir de la reservation. Completer les clauses, signatures et consignes si besoin.",
      "",
      "Conditions a verifier",
      "- Assurance / responsabilites",
      "- Horaires de retrait ou livraison",
      "- Conditions de retour",
    ].join("\n");
  }

  if (definition.type === "inventory") {
    return [
      ...commonHeader,
      "Objet",
      "Etat des lieux de depart / retour. Noter ici l'etat du materiel, les accessoires et toute remarque utile.",
      "",
      "Controles",
      "- Etat general",
      "- Accessoires remis",
      "- Anomalies constatees",
    ].join("\n");
  }

  return [
    ...commonHeader,
    "Objet",
    "Facture de location issue de la reservation. Le montant de caution reste distinct du chiffre d'affaires.",
    "",
    "Suivi de reglement",
    "Preciser ici les informations utiles de suivi ou de reglement si besoin.",
  ].join("\n");
};

const getDocumentStatus = (reservation, documentType) => {
  if (reservation.status === "cancelled") {
    return "cancelled";
  }

  if (documentType === "quote") {
    return ["draft", "pending"].includes(reservation.status) ? "draft" : "validated";
  }

  if (documentType === "contract") {
    return reservation.status === "completed" || reservation.return_tracking?.status === "completed"
      ? "archived"
      : reservation.status === "confirmed"
        ? "to_sign"
        : "pending";
  }

  if (documentType === "inventory") {
    if (reservation.return_tracking?.status === "completed") {
      return "archived";
    }

    if (reservation.departure_tracking?.status === "completed") {
      return "circulating";
    }

    return "planned";
  }

  return revenueStatuses.has(reservation.status) ? "due" : "pending";
};

const buildDocumentPayload = (reservation, documentType, generatedFields) =>
  JSON.stringify({
    reservationStatus: reservation.status,
    fulfillmentMode: reservation.fulfillment_mode || "pickup",
    lineCount: toNumber(reservation.line_count),
    totalQuantity: toNumber(reservation.total_quantity),
    hasDeposit: toNumber(reservation.total_deposit) > 0,
    documentType,
    generated_title: generatedFields.title,
    generated_reference: generatedFields.reference,
    generated_status: generatedFields.status,
    generated_issued_at: serializeDateTime(generatedFields.issued_at),
    generated_due_at: serializeDateTime(generatedFields.due_at),
    generated_content_text: generatedFields.content_text,
  });

const buildDocumentSnapshot = (reservation, definition) => {
  const snapshot = {
    title: definition.title,
    reference: buildDocumentReference(definition.prefix, reservation.reference),
    status: getDocumentStatus(reservation, definition.type),
    amount: toNumber(reservation.total_amount),
    deposit_amount: toNumber(reservation.total_deposit),
    issued_at: reservation.created_at || reservation.start_date,
    due_at:
      definition.type === "invoice"
        ? reservation.end_date
        : definition.type === "inventory"
          ? reservation.start_date
          : reservation.start_date,
    content_text: buildDocumentContentText(reservation, definition),
  };

  return {
    ...snapshot,
    payload_json: buildDocumentPayload(reservation, definition.type, snapshot),
  };
};

const resolveGeneratedField = (currentValue, previousGeneratedValue, nextGeneratedValue) => {
  const normalizedCurrentValue =
    typeof currentValue === "string" ? currentValue.trim() : currentValue ?? null;
  const normalizedPreviousGeneratedValue =
    typeof previousGeneratedValue === "string"
      ? previousGeneratedValue.trim()
      : previousGeneratedValue ?? null;

  if (normalizedCurrentValue === null || normalizedCurrentValue === "") {
    return nextGeneratedValue;
  }

  if (normalizedPreviousGeneratedValue === null || normalizedPreviousGeneratedValue === "") {
    return normalizedCurrentValue;
  }

  return normalizedCurrentValue === normalizedPreviousGeneratedValue
    ? nextGeneratedValue
    : normalizedCurrentValue;
};

const getDocumentPresentation = (documentType, status) =>
  documentStatusMeta[documentType]?.[status] || {
    label: status,
    tone: "neutral",
  };

const mapDocumentRow = (row) => {
  const presentation = getDocumentPresentation(row.document_type, row.status);

  return {
    id: row.id,
    reservation_id: row.reservation_id,
    reservation_reference: row.reservation_reference,
    type: row.document_type,
    title: row.title,
    reference: row.reference,
    status: row.status,
    status_label: presentation.label,
    status_tone: presentation.tone,
    amount: toNumber(row.amount),
    deposit_amount: toNumber(row.deposit_amount),
    issued_at: row.issued_at || row.reservation_created_at,
    due_at: row.due_at || row.reservation_start_date,
    client_name: row.client_name || "Client indisponible",
    primary_item_name: row.primary_item_name || "Produit indisponible",
    content_text: row.content_text || "",
    notes: row.notes || "",
    payload: parseJsonObject(row.payload_json),
  };
};

export const syncReservationDocuments = async (userId, reservations, executor = query) => {
  const { rows: existingRows } = await executor(
    `
      SELECT *
      FROM reservation_documents
      WHERE user_id = $1
    `,
    [userId]
  );
  const existingDocumentsMap = existingRows.reduce((accumulator, row) => {
    accumulator.set(`${row.reservation_id}:${row.document_type}`, row);
    return accumulator;
  }, new Map());

  for (const reservation of reservations) {
    for (const definition of documentDefinitions) {
      const documentSnapshot = buildDocumentSnapshot(reservation, definition);
      const existingDocument = existingDocumentsMap.get(`${reservation.id}:${definition.type}`) || null;
      const existingPayload = parseJsonObject(existingDocument?.payload_json);
      const nextTitle = resolveGeneratedField(
        existingDocument?.title,
        existingPayload.generated_title,
        documentSnapshot.title
      );
      const nextReference = resolveGeneratedField(
        existingDocument?.reference,
        existingPayload.generated_reference,
        documentSnapshot.reference
      );
      const nextStatus = resolveGeneratedField(
        existingDocument?.status,
        existingPayload.generated_status,
        documentSnapshot.status
      );
      const nextIssuedAt = resolveGeneratedField(
        serializeDateTime(existingDocument?.issued_at),
        existingPayload.generated_issued_at,
        serializeDateTime(documentSnapshot.issued_at)
      );
      const nextDueAt = resolveGeneratedField(
        serializeDateTime(existingDocument?.due_at),
        existingPayload.generated_due_at,
        serializeDateTime(documentSnapshot.due_at)
      );
      const nextContentText = resolveGeneratedField(
        existingDocument?.content_text,
        existingPayload.generated_content_text,
        documentSnapshot.content_text
      );
      const nextNotes = existingDocument?.notes || null;
      const documentId = existingDocument?.id || crypto.randomUUID();

      await executor(
        `
          INSERT INTO reservation_documents (
            id,
            reservation_id,
            user_id,
            document_type,
            title,
            reference,
            status,
            amount,
            deposit_amount,
            issued_at,
            due_at,
            payload_json,
            content_text,
            notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (reservation_id, document_type)
          DO UPDATE SET
            title = EXCLUDED.title,
            reference = EXCLUDED.reference,
            status = EXCLUDED.status,
            amount = EXCLUDED.amount,
            deposit_amount = EXCLUDED.deposit_amount,
            issued_at = EXCLUDED.issued_at,
            due_at = EXCLUDED.due_at,
            payload_json = EXCLUDED.payload_json,
            content_text = EXCLUDED.content_text,
            notes = EXCLUDED.notes,
            updated_at = NOW()
        `,
        [
          documentId,
          reservation.id,
          userId,
          definition.type,
          nextTitle,
          nextReference,
          nextStatus,
          documentSnapshot.amount,
          documentSnapshot.deposit_amount,
          nextIssuedAt,
          nextDueAt,
          documentSnapshot.payload_json,
          nextContentText,
          nextNotes,
        ]
      );
    }
  }
};

const listDocumentRows = async (userId) => {
  const { rows } = await query(
    `
      SELECT
        reservation_documents.*,
        reservations.reference AS reservation_reference,
        reservations.status AS reservation_status,
        reservations.start_date AS reservation_start_date,
        reservations.end_date AS reservation_end_date,
        reservations.created_at AS reservation_created_at,
        clients.first_name || ' ' || clients.last_name AS client_name,
        COALESCE(items.name, 'Produit indisponible') AS primary_item_name
      FROM reservation_documents
      INNER JOIN reservations ON reservations.id = reservation_documents.reservation_id
      INNER JOIN clients ON clients.id = reservations.client_id
      LEFT JOIN items ON items.id = reservations.item_id
      WHERE reservation_documents.user_id = $1
      ORDER BY COALESCE(reservation_documents.issued_at, reservations.created_at) DESC,
               reservation_documents.created_at DESC
    `,
    [userId]
  );

  return rows.map(mapDocumentRow);
};

const groupReservationDocuments = (reservations, documentRows) => {
  const documentsByReservationId = documentRows.reduce((accumulator, row) => {
    const currentRows = accumulator.get(row.reservation_id) || [];
    currentRows.push(row);
    accumulator.set(row.reservation_id, currentRows);
    return accumulator;
  }, new Map());

  return reservations
    .map((reservation) => {
      const linkedDocuments = documentsByReservationId.get(reservation.id) || [];
      const byType = linkedDocuments.reduce((accumulator, document) => {
        accumulator[document.type] = document;
        return accumulator;
      }, {});

      return {
        id: reservation.id,
        reservation_id: reservation.id,
        reference: reservation.reference,
        client: reservation.client_name,
        location_amount: toNumber(reservation.total_amount),
        deposit_amount: toNumber(reservation.total_deposit),
        quoteStatus: byType.quote?.status_label || "A valider",
        quoteTone: byType.quote?.status_tone || "warning",
        quoteReference: byType.quote?.reference || "",
        contractStatus: byType.contract?.status_label || "En preparation",
        contractTone: byType.contract?.status_tone || "neutral",
        contractReference: byType.contract?.reference || "",
        inventoryStatus: byType.inventory?.status_label || "A planifier",
        inventoryTone: byType.inventory?.status_tone || "warning",
        inventoryReference: byType.inventory?.reference || "",
        invoiceStatus: byType.invoice?.status_label || "En preparation",
        invoiceTone: byType.invoice?.status_tone || "neutral",
        invoiceReference: byType.invoice?.reference || "",
        documents: linkedDocuments,
      };
    })
    .sort((left, right) => right.reference.localeCompare(left.reference, "fr"));
};

const buildCashEntries = (reservations) => {
  const entries = [];

  reservations.forEach((reservation) => {
    const revenueKey =
      reservation.status === "cancelled"
        ? "revenue_cancelled"
        : revenueStatuses.has(reservation.status)
          ? "revenue_to_collect"
          : "revenue_pending";

    entries.push({
      id: `${reservation.id}-revenue`,
      reservation_id: reservation.id,
      family: "revenue",
      type: "Location",
      label: reservation.primary_item_name || reservation.item_name,
      reference: reservation.reference,
      client_name: reservation.client_name,
      date: reservation.start_date,
      amount: toNumber(reservation.total_amount),
      status_code: revenueKey,
      status: cashStatusMeta[revenueKey].label,
      tone: cashStatusMeta[revenueKey].tone,
    });

    if (toNumber(reservation.total_deposit) <= 0) {
      return;
    }

    const depositStatus = reservation.deposit_tracking?.manual_status || "not_required";
    let depositKey = "deposit_to_collect";

    if (depositStatus === "collected") {
      depositKey =
        reservation.return_tracking?.status === "completed"
          ? "deposit_to_release"
          : "deposit_blocked";
    } else if (depositStatus === "released") {
      depositKey = "deposit_released";
    } else if (depositStatus === "waived") {
      depositKey = "deposit_waived";
    }

    entries.push({
      id: `${reservation.id}-deposit`,
      reservation_id: reservation.id,
      family: "deposit",
      type: "Caution",
      label: reservation.client_name,
      reference: reservation.reference,
      client_name: reservation.client_name,
      date:
        reservation.deposit_tracking?.released_at ||
        reservation.deposit_tracking?.collected_at ||
        reservation.start_date,
      amount: toNumber(reservation.total_deposit),
      status_code: depositKey,
      status: cashStatusMeta[depositKey].label,
      tone: cashStatusMeta[depositKey].tone,
    });
  });

  return entries.sort((left, right) => new Date(right.date) - new Date(left.date));
};

const buildCashSummary = (entries) => ({
  revenue_amount: entries
    .filter((entry) => entry.family === "revenue" && entry.status_code === "revenue_to_collect")
    .reduce((sum, entry) => sum + entry.amount, 0),
  deposit_amount: entries
    .filter((entry) => entry.family === "deposit")
    .reduce((sum, entry) => sum + entry.amount, 0),
  pending_revenue_count: entries.filter((entry) => entry.status_code === "revenue_to_collect").length,
  blocked_deposits_count: entries.filter((entry) => entry.status_code === "deposit_blocked").length,
  deposits_to_release_count: entries.filter((entry) => entry.status_code === "deposit_to_release").length,
  tracked_amount: entries
    .filter((entry) => entry.status_code !== "revenue_cancelled")
    .reduce((sum, entry) => sum + entry.amount, 0),
});

const buildProductStatisticsRows = ({ items, itemProfiles, productUnits, reservations }) => {
  const profilesByItemId = new Map(itemProfiles.map((profile) => [profile.item_id, profile]));
  const unitsByItemId = productUnits.reduce((accumulator, unit) => {
    const currentUnits = accumulator.get(unit.item_id) || [];
    currentUnits.push(unit);
    accumulator.set(unit.item_id, currentUnits);
    return accumulator;
  }, new Map());

  return items
    .map((item) => {
      const profile = profilesByItemId.get(item.id) || null;
      const linkedUnits = unitsByItemId.get(item.id) || [];
      const serialTracking = Boolean(profile?.serial_tracking);
      const blockedUnits = linkedUnits.filter((unit) => blockedUnitStatuses.has(unit.status)).length;
      const trackedCapacity = serialTracking && linkedUnits.length > 0 ? linkedUnits.length : null;
      const usableCapacity =
        trackedCapacity !== null
          ? Math.max(0, trackedCapacity - blockedUnits)
          : blockedItemStatuses.has(item.status)
            ? 0
            : toNumber(item.stock);
      const reservedQuantity = reservations.reduce((sum, reservation) => {
        if (!activeOperationalStatuses.has(reservation.status)) {
          return sum;
        }

        const quantity = reservation.lines
          .filter((line) => line.item_id === item.id)
          .reduce((lineSum, line) => lineSum + toNumber(line.quantity), 0);

        return sum + quantity;
      }, 0);
      const availableQuantity = Math.max(0, usableCapacity - reservedQuantity);

      return {
        id: item.id,
        label: profile?.public_name || item.name,
        reserved_quantity: reservedQuantity,
        available_quantity: availableQuantity,
        blocked_quantity: serialTracking ? blockedUnits : blockedItemStatuses.has(item.status) ? toNumber(item.stock) : 0,
        usage_rate: usableCapacity ? Math.min(100, Math.round((reservedQuantity / usableCapacity) * 100)) : 0,
      };
    })
    .sort((left, right) => right.usage_rate - left.usage_rate || left.label.localeCompare(right.label, "fr"));
};

const buildStatisticsPayload = ({
  windowDays,
  rangeStart,
  rangeEnd,
  reservations,
  statuses,
  deliveries,
  items,
  itemProfiles,
  productUnits,
  documents,
  cash,
}) => {
  const statusMap = new Map(statuses.map((status) => [status.code, status]));
  const reservationsInWindow = reservations.filter((reservation) =>
    isWithinRange(reservation.created_at || reservation.start_date, rangeStart, rangeEnd)
  );
  const deliveriesInWindow = deliveries.filter((tour) =>
    isWithinRange(tour.date || tour.scheduled_for, rangeStart, rangeEnd)
  );
  const documentsInWindow = documents.filter((document) =>
    isWithinRange(document.issued_at || document.due_at, rangeStart, rangeEnd)
  );
  const confirmedReservationsInWindow = reservationsInWindow.filter((reservation) =>
    revenueStatuses.has(reservation.status)
  );
  const confirmedRevenue = confirmedReservationsInWindow.reduce(
    (sum, reservation) => sum + toNumber(reservation.total_amount),
    0
  );
  const dailyRevenueMap = new Map();
  const categoryMap = new Map();
  const bestsellerMap = new Map();
  const reservationStatusMap = new Map();

  confirmedReservationsInWindow.forEach((reservation) => {
    const dayDate = startOfDay(reservation.created_at || reservation.start_date).toISOString();
    const currentDay = dailyRevenueMap.get(dayDate) || {
      date: dayDate,
      label: formatDayLabel(dayDate),
      amount: 0,
    };
    dailyRevenueMap.set(dayDate, {
      ...currentDay,
      amount: currentDay.amount + toNumber(reservation.total_amount),
    });

    reservation.lines.forEach((line) => {
      const categoryKey = line.item_category || "Catalogue";
      const categoryValue = categoryMap.get(categoryKey) || { label: categoryKey, revenue: 0, volume: 0 };
      categoryMap.set(categoryKey, {
        label: categoryKey,
        revenue: categoryValue.revenue + toNumber(line.line_total),
        volume: categoryValue.volume + toNumber(line.quantity),
      });

      bestsellerMap.set(line.item_name, (bestsellerMap.get(line.item_name) || 0) + toNumber(line.quantity));
    });
  });

  reservationsInWindow.forEach((reservation) => {
    reservationStatusMap.set(
      reservation.status,
      (reservationStatusMap.get(reservation.status) || 0) + 1
    );
  });

  const productRows = buildProductStatisticsRows({
    items,
    itemProfiles,
    productUnits,
    reservations,
  });
  const totalUsableCapacity = productRows.reduce(
    (sum, product) => sum + product.reserved_quantity + product.available_quantity,
    0
  );
  const totalReservedCapacity = productRows.reduce((sum, product) => sum + product.reserved_quantity, 0);

  return {
    window_days: windowDays,
    period_start: rangeStart.toISOString(),
    period_end: rangeEnd.toISOString(),
    metrics: {
      confirmed_revenue: confirmedRevenue,
      confirmed_reservations: confirmedReservationsInWindow.length,
      average_order_value: confirmedReservationsInWindow.length
        ? Math.round(confirmedRevenue / confirmedReservationsInWindow.length)
        : 0,
      delivery_assignments: deliveriesInWindow.reduce(
        (sum, delivery) => sum + (Array.isArray(delivery.reservations) ? delivery.reservations.length : 0),
        0
      ),
      tracked_products: items.length,
      park_usage_rate: totalUsableCapacity
        ? Math.round((totalReservedCapacity / totalUsableCapacity) * 100)
        : 0,
      documents_to_follow: documents.filter(
        (document) =>
          document.status !== "cancelled" &&
          !["validated", "archived", "released"].includes(document.status)
      ).length,
      revenue_to_collect: cash.summary.revenue_amount,
      deposits_tracked: cash.summary.deposit_amount,
    },
    revenue_by_day: Array.from(dailyRevenueMap.values()).sort(
      (left, right) => new Date(left.date) - new Date(right.date)
    ),
    category_rows: Array.from(categoryMap.entries())
      .map(([id, row]) => ({
        id,
        label: row.label,
        revenue: row.revenue,
        volume: row.volume,
      }))
      .sort((left, right) => right.revenue - left.revenue),
    reservation_status_rows: Array.from(reservationStatusMap.entries())
      .map(([status, volume]) => ({
        id: status,
        label: statusMap.get(status)?.label || status,
        color: statusMap.get(status)?.color || "#7A869A",
        volume,
      }))
      .sort((left, right) => right.volume - left.volume),
    delivery_rows: deliveriesInWindow
      .map((tour) => ({
        id: tour.id,
        label: tour.name,
        volume: Array.isArray(tour.reservations) ? tour.reservations.length : 0,
      }))
      .sort((left, right) => right.volume - left.volume),
    bestseller_rows: Array.from(bestsellerMap.entries())
      .map(([label, volume]) => ({ label, volume }))
      .sort((left, right) => right.volume - left.volume)
      .slice(0, 8),
    product_rows: productRows.slice(0, 8),
    document_rows: ["quote", "contract", "inventory", "invoice"].map((type) => ({
      id: type,
      label: documentDefinitions.find((definition) => definition.type === type)?.title || type,
      volume: documentsInWindow.filter((document) => document.type === type).length,
    })),
    cash_rows: [
      {
        id: "revenue",
        label: "Revenus location",
        amount: cash.summary.revenue_amount,
      },
      {
        id: "deposit",
        label: "Cautions suivies",
        amount: cash.summary.deposit_amount,
      },
    ],
  };
};

const buildReportingContext = async (userId) => {
  const [reservations, statuses, deliveries, items, itemProfiles, productUnits] = await Promise.all([
    listReservations(userId),
    listReservationStatuses(userId),
    listDeliveryTours(userId),
    listItems(userId),
    listItemProfiles(userId),
    listProductUnits(userId),
  ]);

  await syncReservationDocuments(userId, reservations);
  const documentRows = await listDocumentRows(userId);
  const cashEntries = buildCashEntries(reservations);

  return {
    reservations,
    statuses,
    deliveries,
    items,
    itemProfiles,
    productUnits,
    documents: documentRows,
    cash: {
      entries: cashEntries,
      summary: buildCashSummary(cashEntries),
    },
  };
};

const buildDocumentsReportFromContext = (context) => {
  const reservationRows = groupReservationDocuments(context.reservations, context.documents);
  const invoiceRows = context.documents
    .filter((document) => document.type === "invoice")
    .map((document) => ({
      id: document.id,
      reference: document.reference,
      reservation_reference: document.reservation_reference,
      client: document.client_name,
      issued_at: document.issued_at,
      amount: document.amount,
      deposit_amount: document.deposit_amount,
      status: document.status,
      status_label: document.status_label,
      status_tone: document.status_tone,
      product: document.primary_item_name,
    }))
    .sort((left, right) => new Date(right.issued_at) - new Date(left.issued_at));

  return {
    generated_at: new Date().toISOString(),
    documents: reservationRows,
    invoices: invoiceRows,
    summary: {
      total_documents: context.documents.length,
      invoices_due: invoiceRows.filter((invoice) => invoice.status === "due").length,
      quotes_ready: context.documents.filter(
        (document) => document.type === "quote" && document.status === "validated"
      ).length,
    },
  };
};

export const getDocumentsReport = async (userId, filters = {}) => {
  const context = await buildReportingContext(userId);
  const documentsReport = buildDocumentsReportFromContext(context);

  if (filters.type === "invoice") {
    return {
      ...documentsReport,
      documents: [],
      invoices: documentsReport.invoices,
    };
  }

  return documentsReport;
};

export const getReservationDocument = async (userId, documentId) => {
  const { rows } = await query(
    `
      SELECT
        reservation_documents.*,
        reservations.reference AS reservation_reference,
        reservations.status AS reservation_status,
        reservations.start_date AS reservation_start_date,
        reservations.end_date AS reservation_end_date,
        reservations.created_at AS reservation_created_at,
        clients.first_name || ' ' || clients.last_name AS client_name,
        COALESCE(items.name, 'Produit indisponible') AS primary_item_name
      FROM reservation_documents
      INNER JOIN reservations ON reservations.id = reservation_documents.reservation_id
      INNER JOIN clients ON clients.id = reservations.client_id
      LEFT JOIN items ON items.id = reservations.item_id
      WHERE reservation_documents.user_id = $1
        AND reservation_documents.id = $2
      LIMIT 1
    `,
    [userId, documentId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Document introuvable.");
  }

  const baseDocument = mapDocumentRow(rows[0]);
  const reservations = await listReservations(userId);
  const reservation = reservations.find((entry) => entry.id === baseDocument.reservation_id);

  if (!reservation) {
    throw new HttpError(404, "Reservation liee introuvable.");
  }

  const definition = documentDefinitions.find((entry) => entry.type === baseDocument.type);
  const fallbackContent = definition
    ? buildDocumentContentText(reservation, definition)
    : baseDocument.content_text;

  return {
    ...baseDocument,
    type_label: definition?.title || baseDocument.type,
    status_options: Object.entries(documentStatusMeta[baseDocument.type] || {}).map(([value, meta]) => ({
      value,
      label: meta.label,
      tone: meta.tone,
    })),
    content_text: baseDocument.content_text || fallbackContent,
    reservation: {
      id: reservation.id,
      reference: reservation.reference,
      status: reservation.status,
      client_name: reservation.client_name,
      start_date: reservation.start_date,
      end_date: reservation.end_date,
      total_amount: toNumber(reservation.total_amount),
      total_deposit: toNumber(reservation.total_deposit),
      item_summary:
        reservation.lines?.length > 1
          ? `${reservation.lines[0]?.item_name || "Produit"} +${reservation.lines.length - 1} produit(s)`
          : reservation.lines?.[0]?.item_name || reservation.item_name || "Produit indisponible",
    },
  };
};

export const updateReservationDocument = async (userId, documentId, payload = {}) => {
  const currentDocument = await getReservationDocument(userId, documentId);
  const nextTitle = normalizeInlineText(payload.title || currentDocument.title);
  const nextStatus = normalizeInlineText(payload.status || currentDocument.status);
  const nextNotes = normalizeFreeText(payload.notes);
  const nextContentText = normalizeFreeText(payload.content_text || payload.contentText);
  const allowedStatuses = new Set(
    Object.keys(documentStatusMeta[currentDocument.type] || {})
  );

  if (!nextTitle) {
    throw new HttpError(400, "Le titre du document est obligatoire.");
  }

  if (!allowedStatuses.has(nextStatus)) {
    throw new HttpError(400, "Le statut du document est invalide.");
  }

  let nextDueAt = currentDocument.due_at;

  if (payload.due_at !== undefined || payload.dueAt !== undefined) {
    const parsedDueAt = serializeDateTime(payload.due_at ?? payload.dueAt);

    if (!parsedDueAt) {
      throw new HttpError(400, "La date du document est invalide.");
    }

    nextDueAt = parsedDueAt;
  }

  const { rows } = await query(
    `
      UPDATE reservation_documents
      SET
        title = $3,
        status = $4,
        due_at = $5,
        content_text = $6,
        notes = $7,
        updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING id
    `,
    [
      userId,
      documentId,
      nextTitle,
      nextStatus,
      nextDueAt,
      nextContentText || currentDocument.content_text,
      nextNotes || null,
    ]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Document introuvable.");
  }

  return getReservationDocument(userId, documentId);
};

export const getCashJournal = async (userId) => {
  const context = await buildReportingContext(userId);

  return {
    generated_at: new Date().toISOString(),
    entries: context.cash.entries,
    summary: context.cash.summary,
  };
};

export const getStatistics = async (userId, { window } = {}) => {
  const { windowDays, start, end } = buildWindowRange(window);
  const context = await buildReportingContext(userId);

  return buildStatisticsPayload({
    windowDays,
    rangeStart: start,
    rangeEnd: end,
    reservations: context.reservations,
    statuses: context.statuses,
    deliveries: context.deliveries,
    items: context.items,
    itemProfiles: context.itemProfiles,
    productUnits: context.productUnits,
    documents: context.documents,
    cash: context.cash,
  });
};

export const getReportingOverview = async (userId) => {
  const context = await buildReportingContext(userId);
  const documents = buildDocumentsReportFromContext(context);
  const cash = {
    generated_at: new Date().toISOString(),
    entries: context.cash.entries,
    summary: context.cash.summary,
  };

  return {
    generated_at: new Date().toISOString(),
    documents: documents.documents,
    invoices: documents.invoices,
    cash,
  };
};
