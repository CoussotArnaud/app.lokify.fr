import crypto from "crypto";

import { query } from "../config/db.js";
import { computeScheduledPurgeAt } from "./archive-maintenance.service.js";
import { recordDomainEvent } from "./domain-events.service.js";
import HttpError from "../utils/http-error.js";

const normalizeWhitespace = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeComparableText = (value) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeEmail = (value) => normalizeWhitespace(value).toLowerCase();

const normalizePhone = (value) => {
  const digitsOnly = normalizeWhitespace(value).replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  if (digitsOnly.startsWith("33") && digitsOnly.length === 11) {
    return `0${digitsOnly.slice(2)}`;
  }

  return digitsOnly;
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeClientPayload = (payload = {}) => ({
  first_name: normalizeWhitespace(payload.first_name ?? payload.firstName ?? ""),
  last_name: normalizeWhitespace(payload.last_name ?? payload.lastName ?? ""),
  email: normalizeEmail(payload.email ?? ""),
  phone: normalizeWhitespace(payload.phone ?? ""),
  address: normalizeWhitespace(payload.address ?? ""),
  notes: String(payload.notes ?? "").trim(),
  _first_name_key: normalizeComparableText(payload.first_name ?? payload.firstName ?? ""),
  _last_name_key: normalizeComparableText(payload.last_name ?? payload.lastName ?? ""),
  _email_key: normalizeEmail(payload.email ?? ""),
  _phone_key: normalizePhone(payload.phone ?? ""),
});

const validateClient = (client) => {
  if (!client.first_name || !client.last_name || !client.email) {
    throw new HttpError(400, "Veuillez remplir les champs obligatoires.");
  }

  if (!isValidEmail(client.email)) {
    throw new HttpError(400, "Le format de l'email est invalide.");
  }
};

const isDuplicateClient = (existingClient, client) => {
  const existingEmailKey = normalizeEmail(existingClient.email);
  const existingPhoneKey = normalizePhone(existingClient.phone);
  const sameName =
    normalizeComparableText(existingClient.first_name) === client._first_name_key &&
    normalizeComparableText(existingClient.last_name) === client._last_name_key;
  const sameEmail = Boolean(client._email_key) && existingEmailKey === client._email_key;
  const samePhone = Boolean(client._phone_key) && existingPhoneKey === client._phone_key;
  const sameNameWithoutReliableContact =
    sameName &&
    (!client._email_key || !existingEmailKey) &&
    (!client._phone_key || !existingPhoneKey);

  return sameEmail || samePhone || sameNameWithoutReliableContact;
};

const getDuplicateClientMessage = (existingClient, client) => {
  if (existingClient.archived_at) {
    return "Ce client existe deja en archive. Restaurez la fiche archivee au lieu d'en creer une nouvelle.";
  }

  if (client._email_key && normalizeEmail(existingClient.email) === client._email_key) {
    return "Ce client existe deja avec cette adresse email.";
  }

  if (client._phone_key && normalizePhone(existingClient.phone) === client._phone_key) {
    return "Ce client existe deja avec ce numero de telephone.";
  }

  return "Ce client existe deja.";
};

const ensureNoDuplicateClient = async (userId, client, ignoredClientId = null) => {
  const { rows } = await query(
    `
      SELECT id, first_name, last_name, email, phone, archived_at
      FROM clients
      WHERE user_id = $1
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      ORDER BY created_at DESC
    `,
    [userId, ignoredClientId]
  );

  const duplicateClient = rows.find((existingClient) => isDuplicateClient(existingClient, client));

  if (duplicateClient) {
    throw new HttpError(409, getDuplicateClientMessage(duplicateClient, client));
  }
};

const buildClientScopeClause = (scope = "active") => {
  const normalizedScope = String(scope || "active").trim().toLowerCase();

  if (normalizedScope === "active") {
    return {
      normalizedScope,
      clause: "archived_at IS NULL",
    };
  }

  if (normalizedScope === "archived") {
    return {
      normalizedScope,
      clause: "archived_at IS NOT NULL",
    };
  }

  if (normalizedScope === "all") {
    return {
      normalizedScope,
      clause: "1 = 1",
    };
  }

  throw new HttpError(400, "Scope client invalide.");
};

const serializeClient = (row) => ({
  ...row,
  metrics: row
    ? {
        reservationCount: Number(row.reservation_count || 0),
        totalRevenue: Number(row.total_revenue || 0),
      }
    : undefined,
  archive: {
    isArchived: Boolean(row?.archived_at),
    archivedAt: row?.archived_at || null,
    archivedBy: row?.archived_by || null,
    archiveReason: row?.archive_reason || null,
    scheduledPurgeAt: row?.scheduled_purge_at || null,
    restoredAt: row?.restored_at || null,
    restoredBy: row?.restored_by || null,
    restoreReason: row?.restore_reason || null,
  },
});

const hydrateClientMetrics = async (rows = []) => {
  if (!rows.length) {
    return [];
  }

  const clientIds = rows.map((row) => row.id);
  const placeholders = clientIds.map((_, index) => `$${index + 1}`).join(", ");
  const { rows: metricRows } = await query(
    `
      SELECT
        client_id,
        COUNT(*) AS reservation_count,
        COALESCE(
          SUM(
            CASE
              WHEN status IN ('confirmed', 'completed') THEN total_amount
              ELSE 0
            END
          ),
          0
        ) AS total_revenue
      FROM reservations
      WHERE client_id IN (${placeholders})
      GROUP BY client_id
    `,
    clientIds
  );
  const metricsByClientId = new Map(
    metricRows.map((row) => [
      row.client_id,
      {
        reservation_count: Number(row.reservation_count || 0),
        total_revenue: Number(row.total_revenue || 0),
      },
    ])
  );

  return rows.map((row) => ({
    ...row,
    reservation_count: metricsByClientId.get(row.id)?.reservation_count || 0,
    total_revenue: metricsByClientId.get(row.id)?.total_revenue || 0,
  }));
};

const ensureClientOwnedByUser = async (userId, clientId, { allowArchived = true } = {}) => {
  const { rows } = await query(
    `
      SELECT *
      FROM clients
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [clientId, userId]
  );

  const [client] = await hydrateClientMetrics(rows);

  if (!client) {
    throw new HttpError(404, "Client introuvable.");
  }

  if (!allowArchived && client.archived_at) {
    throw new HttpError(409, "Ce client est archive.");
  }

  return client;
};

export const listClients = async (userId, { scope = "active" } = {}) => {
  const scopeFilter = buildClientScopeClause(scope);
  const { rows } = await query(
    `
      SELECT *
      FROM clients
      WHERE user_id = $1
        AND ${scopeFilter.clause}
      ORDER BY created_at DESC
    `,
    [userId]
  );

  const hydratedRows = await hydrateClientMetrics(rows);
  return hydratedRows.map(serializeClient);
};

export const getClientById = async (userId, clientId) => {
  const client = await ensureClientOwnedByUser(userId, clientId);
  return serializeClient(client);
};

export const createClient = async (userId, payload) => {
  const client = normalizeClientPayload(payload);
  validateClient(client);
  await ensureNoDuplicateClient(userId, client);
  const clientId = crypto.randomUUID();

  const { rows } = await query(
    `
      INSERT INTO clients (id, user_id, first_name, last_name, email, phone, address, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      clientId,
      userId,
      client.first_name,
      client.last_name,
      client.email,
      client.phone,
      client.address,
      client.notes,
    ]
  );

  return getClientById(userId, rows[0].id);
};

export const updateClient = async (userId, clientId, payload) => {
  const currentClient = await ensureClientOwnedByUser(userId, clientId, {
    allowArchived: false,
  });
  const client = normalizeClientPayload(payload);
  validateClient(client);
  await ensureNoDuplicateClient(userId, client, clientId);

  await query(
    `
      UPDATE clients
      SET first_name = $3,
          last_name = $4,
          email = $5,
          phone = $6,
          address = $7,
          notes = $8,
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2
    `,
    [
      clientId,
      userId,
      client.first_name,
      client.last_name,
      client.email,
      client.phone,
      client.address,
      client.notes,
    ]
  );

  return getClientById(currentClient.user_id, clientId);
};

export const archiveClient = async (
  userId,
  clientId,
  { actorUserId = userId, archiveReason = null } = {}
) => {
  const currentClient = await ensureClientOwnedByUser(userId, clientId);

  if (currentClient.archived_at) {
    throw new HttpError(409, "Ce client est deja archive.");
  }

  const archivedAt = new Date().toISOString();
  const scheduledPurgeAt = computeScheduledPurgeAt(archivedAt);

  const { rows } = await query(
    `
      UPDATE clients
      SET archived_at = $3,
          archived_by = $4,
          archive_reason = $5,
          scheduled_purge_at = $6,
          restored_at = NULL,
          restored_by = NULL,
          restore_reason = NULL,
          updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
      RETURNING id
    `,
    [clientId, userId, archivedAt, actorUserId, normalizeWhitespace(archiveReason) || null, scheduledPurgeAt]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Client introuvable.");
  }

  await recordDomainEvent(query, {
    userId,
    actorUserId,
    aggregateType: "client",
    aggregateId: clientId,
    eventType: "client.archived",
    payload: {
      client_id: clientId,
      first_name: currentClient.first_name,
      last_name: currentClient.last_name,
      email: currentClient.email,
      archived_at: archivedAt,
      scheduled_purge_at: scheduledPurgeAt,
      archive_reason: normalizeWhitespace(archiveReason) || null,
    },
  });

  return getClientById(userId, clientId);
};

export const restoreClient = async (
  userId,
  clientId,
  { actorUserId = userId, restoreReason = null } = {}
) => {
  const currentClient = await ensureClientOwnedByUser(userId, clientId);

  if (!currentClient.archived_at) {
    throw new HttpError(409, "Ce client n'est pas archive.");
  }

  const restoredAt = new Date().toISOString();

  const { rows } = await query(
    `
      UPDATE clients
      SET archived_at = NULL,
          archived_by = NULL,
          archive_reason = NULL,
          scheduled_purge_at = NULL,
          restored_at = $3,
          restored_by = $4,
          restore_reason = $5,
          updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
      RETURNING id
    `,
    [clientId, userId, restoredAt, actorUserId, normalizeWhitespace(restoreReason) || null]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Client introuvable.");
  }

  await recordDomainEvent(query, {
    userId,
    actorUserId,
    aggregateType: "client",
    aggregateId: clientId,
    eventType: "client.restored",
    payload: {
      client_id: clientId,
      first_name: currentClient.first_name,
      last_name: currentClient.last_name,
      email: currentClient.email,
      restored_at: restoredAt,
      restore_reason: normalizeWhitespace(restoreReason) || null,
    },
  });

  return getClientById(userId, clientId);
};

export const deleteClient = async (userId, clientId, options = {}) =>
  archiveClient(userId, clientId, options);

export const ensureActiveClientOwnedByUser = async (userId, clientId) => {
  const client = await ensureClientOwnedByUser(userId, clientId, {
    allowArchived: false,
  });

  return serializeClient(client);
};

export const ensureAnyClientOwnedByUser = async (userId, clientId) => {
  const client = await ensureClientOwnedByUser(userId, clientId);
  return serializeClient(client);
};
