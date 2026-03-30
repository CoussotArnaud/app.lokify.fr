import crypto from "crypto";

import { pool, query } from "../config/db.js";

export const ARCHIVE_RETENTION_YEARS = 10;

export const computeScheduledPurgeAt = (baseValue = new Date()) => {
  const baseDate = baseValue instanceof Date ? new Date(baseValue.getTime()) : new Date(baseValue);

  if (Number.isNaN(baseDate.getTime())) {
    const fallbackDate = new Date();
    fallbackDate.setUTCFullYear(fallbackDate.getUTCFullYear() + ARCHIVE_RETENTION_YEARS);
    return fallbackDate.toISOString();
  }

  baseDate.setUTCFullYear(baseDate.getUTCFullYear() + ARCHIVE_RETENTION_YEARS);
  return baseDate.toISOString();
};

const insertPurgeLog = async (
  executor,
  {
    entityType,
    entityId,
    ownerUserId = null,
    archivedAt = null,
    archivedBy = null,
    archiveReason = null,
    scheduledPurgeAt = null,
    purgedAt,
    purgeTrigger,
    payload = {},
  }
) =>
  executor(
    `
      INSERT INTO archive_purge_logs (
        id,
        entity_type,
        entity_id,
        owner_user_id,
        archived_at,
        archived_by,
        archive_reason,
        scheduled_purge_at,
        purged_at,
        purge_trigger,
        payload_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      crypto.randomUUID(),
      entityType,
      entityId,
      ownerUserId,
      archivedAt,
      archivedBy,
      archiveReason,
      scheduledPurgeAt,
      purgedAt,
      purgeTrigger,
      JSON.stringify(payload || {}),
    ]
  );

const getClientPurgeSnapshot = async (executor, providerUserId, clientId) => {
  const [reservationCountResult, documentCountResult, clientRowResult] = await Promise.all([
    executor(
      `
        SELECT COUNT(*) AS total
        FROM reservations
        WHERE user_id = $1
          AND client_id = $2
      `,
      [providerUserId, clientId]
    ),
    executor(
      `
        SELECT COUNT(*) AS total
        FROM client_documents
        WHERE user_id = $1
          AND client_id = $2
      `,
      [providerUserId, clientId]
    ),
    executor(
      `
        SELECT first_name, last_name, email
        FROM clients
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [clientId, providerUserId]
    ),
  ]);

  return {
    client: clientRowResult.rows[0]
      ? {
          first_name: clientRowResult.rows[0].first_name,
          last_name: clientRowResult.rows[0].last_name,
          email: clientRowResult.rows[0].email,
        }
      : null,
    totalReservations: Number(reservationCountResult.rows[0]?.total || 0),
    totalDocuments: Number(documentCountResult.rows[0]?.total || 0),
  };
};

const getProviderPurgeSnapshot = async (executor, providerId) => {
  const [
    providerRowResult,
    activeClientCountResult,
    archivedClientCountResult,
    reservationCountResult,
    itemCountResult,
    supportTicketCountResult,
  ] = await Promise.all([
    executor(
      `
        SELECT full_name, company_name, email, siret, provider_status
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [providerId]
    ),
    executor(
      `
        SELECT COUNT(*) AS total
        FROM clients
        WHERE user_id = $1
          AND archived_at IS NULL
      `,
      [providerId]
    ),
    executor(
      `
        SELECT COUNT(*) AS total
        FROM clients
        WHERE user_id = $1
          AND archived_at IS NOT NULL
      `,
      [providerId]
    ),
    executor(
      `
        SELECT COUNT(*) AS total
        FROM reservations
        WHERE user_id = $1
      `,
      [providerId]
    ),
    executor(
      `
        SELECT COUNT(*) AS total
        FROM items
        WHERE user_id = $1
      `,
      [providerId]
    ),
    executor(
      `
        SELECT COUNT(*) AS total
        FROM support_tickets
        WHERE provider_user_id = $1
           OR created_by_user_id = $1
      `,
      [providerId]
    ),
  ]);

  return {
    provider: providerRowResult.rows[0]
      ? {
          full_name: providerRowResult.rows[0].full_name,
          company_name: providerRowResult.rows[0].company_name,
          email: providerRowResult.rows[0].email,
          siret: providerRowResult.rows[0].siret,
          provider_status: providerRowResult.rows[0].provider_status,
        }
      : null,
    totalActiveClients: Number(activeClientCountResult.rows[0]?.total || 0),
    totalArchivedClients: Number(archivedClientCountResult.rows[0]?.total || 0),
    totalReservations: Number(reservationCountResult.rows[0]?.total || 0),
    totalItems: Number(itemCountResult.rows[0]?.total || 0),
    totalSupportTickets: Number(supportTicketCountResult.rows[0]?.total || 0),
  };
};

const purgeArchivedClientRecord = async (clientRow, { purgeTrigger, purgedAt }) => {
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const executor = dbClient.query.bind(dbClient);
    const snapshot = await getClientPurgeSnapshot(executor, clientRow.user_id, clientRow.id);

    await insertPurgeLog(executor, {
      entityType: "client",
      entityId: clientRow.id,
      ownerUserId: clientRow.user_id,
      archivedAt: clientRow.archived_at,
      archivedBy: clientRow.archived_by,
      archiveReason: clientRow.archive_reason,
      scheduledPurgeAt: clientRow.scheduled_purge_at,
      purgedAt,
      purgeTrigger,
      payload: snapshot,
    });

    await executor(
      `
        DELETE FROM reservations
        WHERE user_id = $1
          AND client_id = $2
      `,
      [clientRow.user_id, clientRow.id]
    );

    await executor(
      `
        DELETE FROM clients
        WHERE id = $1
          AND user_id = $2
      `,
      [clientRow.id, clientRow.user_id]
    );

    await dbClient.query("COMMIT");

    return {
      entityType: "client",
      entityId: clientRow.id,
      ownerUserId: clientRow.user_id,
      purgedAt,
      scheduledPurgeAt: clientRow.scheduled_purge_at,
      snapshot,
    };
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
};

const purgeArchivedProviderRecord = async (providerRow, { purgeTrigger, purgedAt }) => {
  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    const executor = dbClient.query.bind(dbClient);
    const snapshot = await getProviderPurgeSnapshot(executor, providerRow.id);

    await insertPurgeLog(executor, {
      entityType: "provider",
      entityId: providerRow.id,
      ownerUserId: providerRow.id,
      archivedAt: providerRow.archived_at,
      archivedBy: providerRow.archived_by,
      archiveReason: providerRow.archive_reason,
      scheduledPurgeAt: providerRow.scheduled_purge_at,
      purgedAt,
      purgeTrigger,
      payload: snapshot,
    });

    await executor(
      `
        DELETE FROM support_tickets
        WHERE provider_user_id = $1
           OR created_by_user_id = $1
      `,
      [providerRow.id]
    );

    await executor(
      `
        DELETE FROM reservations
        WHERE user_id = $1
      `,
      [providerRow.id]
    );

    await executor(
      `
        DELETE FROM clients
        WHERE user_id = $1
      `,
      [providerRow.id]
    );

    await executor(
      `
        DELETE FROM users
        WHERE id = $1
          AND account_role = 'provider'
      `,
      [providerRow.id]
    );

    await dbClient.query("COMMIT");

    return {
      entityType: "provider",
      entityId: providerRow.id,
      ownerUserId: providerRow.id,
      purgedAt,
      scheduledPurgeAt: providerRow.scheduled_purge_at,
      snapshot,
    };
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
};

export const purgeExpiredArchivedRecords = async ({
  now = new Date().toISOString(),
  purgeTrigger = "cron",
} = {}) => {
  const purgedAt = new Date(now).toISOString();
  const dueProviderResult = await query(
    `
      SELECT id, archived_at, archived_by, archive_reason, scheduled_purge_at
      FROM users
      WHERE account_role = 'provider'
        AND archived_at IS NOT NULL
        AND scheduled_purge_at IS NOT NULL
        AND scheduled_purge_at <= $1
      ORDER BY scheduled_purge_at ASC, archived_at ASC
    `,
    [purgedAt]
  );
  const dueProviderIds = new Set(dueProviderResult.rows.map((row) => row.id));
  const dueClientResult = await query(
    `
      SELECT id, user_id, archived_at, archived_by, archive_reason, scheduled_purge_at
      FROM clients
      WHERE archived_at IS NOT NULL
        AND scheduled_purge_at IS NOT NULL
        AND scheduled_purge_at <= $1
      ORDER BY scheduled_purge_at ASC, archived_at ASC
    `,
    [purgedAt]
  );

  const purgedProviders = [];
  for (const providerRow of dueProviderResult.rows) {
    purgedProviders.push(
      await purgeArchivedProviderRecord(providerRow, {
        purgeTrigger,
        purgedAt,
      })
    );
  }

  const purgedClients = [];
  for (const clientRow of dueClientResult.rows) {
    if (dueProviderIds.has(clientRow.user_id)) {
      continue;
    }

    purgedClients.push(
      await purgeArchivedClientRecord(clientRow, {
        purgeTrigger,
        purgedAt,
      })
    );
  }

  return {
    retentionYears: ARCHIVE_RETENTION_YEARS,
    checkedAt: purgedAt,
    purgeTrigger,
    purgedProviders,
    purgedClients,
    totalPurgedProviders: purgedProviders.length,
    totalPurgedClients: purgedClients.length,
  };
};
