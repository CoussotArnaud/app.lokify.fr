import crypto from "crypto";

import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";

const allowedEventStatuses = new Set(["pending", "processed", "failed"]);
const allowedViewerRoles = new Set(["provider", "super_admin"]);

const normalizeText = (value) => String(value ?? "").trim();
const parseJsonObject = (value) => {
  try {
    return JSON.parse(value || "{}");
  } catch (_error) {
    return {};
  }
};

const ensureViewerRole = (user) => {
  const role = normalizeText(user?.account_role).toLowerCase();

  if (!allowedViewerRoles.has(role)) {
    throw new HttpError(403, "Acces aux evenements indisponible pour ce compte.");
  }

  return role;
};

const serializeDomainEvent = (row) => ({
  id: row.id,
  user_id: row.user_id,
  actor_user_id: row.actor_user_id || null,
  aggregate_type: row.aggregate_type,
  aggregate_id: row.aggregate_id,
  event_type: row.event_type,
  event_status: row.event_status,
  payload: parseJsonObject(row.payload_json),
  occurred_at: row.occurred_at,
  processed_at: row.processed_at || null,
  actor: row.actor_user_id
    ? {
        id: row.actor_user_id,
        full_name: row.actor_name || null,
        email: row.actor_email || null,
      }
    : null,
  provider: {
    id: row.user_id,
    full_name: row.provider_name || null,
    email: row.provider_email || null,
  },
});

export const recordDomainEvent = async (
  executor = query,
  {
    userId,
    actorUserId = null,
    aggregateType,
    aggregateId,
    eventType,
    eventStatus = "pending",
    payload = {},
    occurredAt = new Date().toISOString(),
  }
) => {
  if (!userId || !aggregateType || !aggregateId || !eventType) {
    throw new HttpError(400, "Evenement metier incomplet.");
  }

  if (!allowedEventStatuses.has(eventStatus)) {
    throw new HttpError(400, "Statut d'evenement invalide.");
  }

  await executor(
    `
      INSERT INTO domain_events (
        id,
        user_id,
        actor_user_id,
        aggregate_type,
        aggregate_id,
        event_type,
        event_status,
        payload_json,
        occurred_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $9)
    `,
    [
      crypto.randomUUID(),
      userId,
      actorUserId || userId,
      normalizeText(aggregateType),
      String(aggregateId),
      normalizeText(eventType),
      eventStatus,
      JSON.stringify(payload || {}),
      occurredAt,
    ]
  );
};

export const listDomainEvents = async (user, filters = {}) => {
  const role = ensureViewerRole(user);
  const limit = Math.min(Math.max(Number(filters.limit || 20), 1), 100);
  const aggregateType = normalizeText(filters.aggregate_type ?? filters.aggregateType);
  const eventType = normalizeText(filters.event_type ?? filters.eventType);
  const eventStatus = normalizeText(filters.event_status ?? filters.eventStatus);
  const requestedProviderUserId = normalizeText(
    filters.provider_user_id ?? filters.providerUserId
  );
  const values = [];
  const whereParts = [];

  if (role === "provider") {
    values.push(user.id);
    whereParts.push(`domain_events.user_id = $${values.length}`);
  } else if (requestedProviderUserId) {
    values.push(requestedProviderUserId);
    whereParts.push(`domain_events.user_id = $${values.length}`);
  }

  if (aggregateType) {
    values.push(aggregateType);
    whereParts.push(`domain_events.aggregate_type = $${values.length}`);
  }

  if (eventType) {
    values.push(eventType);
    whereParts.push(`domain_events.event_type = $${values.length}`);
  }

  if (eventStatus) {
    values.push(eventStatus);
    whereParts.push(`domain_events.event_status = $${values.length}`);
  }

  values.push(limit);
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const { rows } = await query(
    `
      SELECT
        domain_events.*,
        provider.full_name AS provider_name,
        provider.email AS provider_email,
        actor.full_name AS actor_name,
        actor.email AS actor_email
      FROM domain_events
      INNER JOIN users AS provider
        ON provider.id = domain_events.user_id
      LEFT JOIN users AS actor
        ON actor.id = domain_events.actor_user_id
      ${whereClause}
      ORDER BY domain_events.occurred_at DESC, domain_events.created_at DESC
      LIMIT $${values.length}
    `,
    values
  );

  const events = rows.map(serializeDomainEvent);

  return {
    role,
    filters: {
      limit,
      provider_user_id: role === "provider" ? user.id : requestedProviderUserId || null,
      aggregate_type: aggregateType || null,
      event_type: eventType || null,
      event_status: eventStatus || null,
    },
    summary: {
      total: events.length,
      pending: events.filter((event) => event.event_status === "pending").length,
      processed: events.filter((event) => event.event_status === "processed").length,
      failed: events.filter((event) => event.event_status === "failed").length,
    },
    events,
  };
};
