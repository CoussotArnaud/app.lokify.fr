import crypto from "crypto";

import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";

const allowedTicketStatuses = new Set(["open", "in_progress", "closed"]);
const allowedCategories = new Set(["general", "billing", "technical", "catalog", "training"]);

const normalizeText = (value) => String(value || "").trim();

const normalizeTicketStatus = (value, fallback = "open") => {
  const normalizedStatus = normalizeText(value || fallback).toLowerCase();

  if (!allowedTicketStatuses.has(normalizedStatus)) {
    throw new HttpError(400, "Statut de ticket invalide.");
  }

  return normalizedStatus;
};

const normalizeCategory = (value) => {
  const normalizedCategory = normalizeText(value || "general").toLowerCase();
  return allowedCategories.has(normalizedCategory) ? normalizedCategory : "general";
};

const ensureSupportUser = (user) => {
  const role = String(user?.account_role || "").trim().toLowerCase();

  if (!["provider", "super_admin"].includes(role)) {
    throw new HttpError(403, "Acces support indisponible pour ce compte.");
  }

  return role;
};

const createTicketReference = () => `SUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const mapCountRows = (rows) =>
  new Map(rows.map((row) => [row.provider_user_id, Number(row.total || 0)]));

const serializeNotification = (row) => ({
  id: row.id,
  ticket_id: row.ticket_id || null,
  notification_type: row.notification_type,
  title: row.title,
  body: row.body,
  read_at: row.read_at || null,
  created_at: row.created_at,
  provider: row.provider_user_id
    ? {
        id: row.provider_user_id,
        full_name: row.provider_name,
        email: row.provider_email,
      }
    : null,
});

const serializeMessage = (row) => ({
  id: row.id,
  ticket_id: row.ticket_id,
  body: row.body,
  author_role: row.author_role,
  created_at: row.created_at,
  author: {
    id: row.user_id,
    full_name: row.author_name,
    email: row.author_email,
  },
});

const serializeTicketSummary = (row) => ({
  id: row.id,
  reference: row.reference,
  subject: row.subject,
  category: row.category,
  status: row.status,
  created_at: row.created_at,
  updated_at: row.updated_at,
  last_message_at: row.last_message_at,
  total_messages: Number(row.total_messages || 0),
  unread_notifications: Number(row.unread_notifications || 0),
  latest_message_preview: normalizeText(row.latest_message_body).slice(0, 160) || null,
  latest_message_author_role: row.latest_message_author_role || null,
  provider: {
    id: row.provider_user_id,
    full_name: row.provider_name,
    email: row.provider_email,
  },
  created_by: {
    id: row.created_by_user_id,
    full_name: row.created_by_name,
    email: row.created_by_email,
  },
});

const fetchSupportTicketRow = async (ticketId) => {
  const { rows } = await query(
    `
      SELECT
        support_tickets.*,
        provider.full_name AS provider_name,
        provider.email AS provider_email,
        creator.full_name AS created_by_name,
        creator.email AS created_by_email
      FROM support_tickets
      INNER JOIN users AS provider
        ON provider.id = support_tickets.provider_user_id
      INNER JOIN users AS creator
        ON creator.id = support_tickets.created_by_user_id
      WHERE support_tickets.id = $1
      LIMIT 1
    `,
    [ticketId]
  );

  return rows[0] || null;
};

const ensureTicketAccess = async (user, ticketId) => {
  const role = ensureSupportUser(user);
  const ticket = await fetchSupportTicketRow(ticketId);

  if (!ticket) {
    throw new HttpError(404, "Ticket introuvable.");
  }

  if (role === "provider" && ticket.provider_user_id !== user.id) {
    throw new HttpError(404, "Ticket introuvable.");
  }

  return ticket;
};

const listAdminRecipients = async () => {
  const { rows } = await query(
    `
      SELECT id
      FROM users
      WHERE account_role = 'super_admin'
    `
  );

  return rows.map((row) => row.id);
};

const insertNotification = async ({
  userId,
  ticketId = null,
  notificationType,
  title,
  body,
  createdAt = new Date().toISOString(),
}) => {
  await query(
    `
      INSERT INTO support_notifications (
        id,
        user_id,
        ticket_id,
        notification_type,
        title,
        body,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
    `,
    [crypto.randomUUID(), userId, ticketId, notificationType, title, body, createdAt]
  );
};

const notifySuperAdminsAboutNewTicket = async ({ ticketId, subject, providerName }) => {
  const adminIds = await listAdminRecipients();

  await Promise.all(
    adminIds.map((adminId) =>
      insertNotification({
        userId: adminId,
        ticketId,
        notificationType: "support_ticket_created",
        title: "Nouveau ticket support",
        body: `${providerName} a cree le ticket "${subject}".`,
      })
    )
  );
};

const notifyProviderAboutAdminReply = async ({ providerUserId, ticketId, subject }) =>
  insertNotification({
    userId: providerUserId,
    ticketId,
    notificationType: "support_ticket_reply",
    title: "Nouvelle reponse du support",
    body: `Le support Lokify a repondu au ticket "${subject}".`,
  });

const buildSupportMetrics = (tickets = [], notifications = []) => ({
  totalTickets: tickets.length,
  openTickets: tickets.filter((ticket) => ticket.status === "open").length,
  inProgressTickets: tickets.filter((ticket) => ticket.status === "in_progress").length,
  closedTickets: tickets.filter((ticket) => ticket.status === "closed").length,
  unreadNotifications: notifications.filter((notification) => !notification.read_at).length,
});

const listSupportNotifications = async (userId, limit = 8) => {
  const { rows } = await query(
    `
      SELECT
        support_notifications.*,
        support_tickets.provider_user_id,
        provider.full_name AS provider_name,
        provider.email AS provider_email
      FROM support_notifications
      LEFT JOIN support_tickets
        ON support_tickets.id = support_notifications.ticket_id
      LEFT JOIN users AS provider
        ON provider.id = support_tickets.provider_user_id
      WHERE support_notifications.user_id = $1
      ORDER BY support_notifications.created_at DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return rows.map(serializeNotification);
};

const listTicketSummaries = async ({ viewerUserId, providerUserId = null }) => {
  const params = [];
  const whereParts = [];

  if (providerUserId) {
    params.push(providerUserId);
    whereParts.push(`tickets.provider_user_id = $${params.length}`);
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const { rows } = await query(
    `
      SELECT
        tickets.id,
        tickets.reference,
        tickets.subject,
        tickets.category,
        tickets.status,
        tickets.created_at,
        tickets.updated_at,
        tickets.last_message_at,
        tickets.provider_user_id,
        tickets.created_by_user_id,
        provider.full_name AS provider_name,
        provider.email AS provider_email,
        creator.full_name AS created_by_name,
        creator.email AS created_by_email
      FROM support_tickets AS tickets
      INNER JOIN users AS provider
        ON provider.id = tickets.provider_user_id
      INNER JOIN users AS creator
        ON creator.id = tickets.created_by_user_id
      ${whereClause}
      ORDER BY tickets.last_message_at DESC, tickets.created_at DESC
    `,
    params
  );

  const [messageCountRows, latestMessageRows, unreadRows] = await Promise.all([
    query(
      `
        SELECT ticket_id, COUNT(*) AS total_messages
        FROM support_ticket_messages
        GROUP BY ticket_id
      `
    ),
    query(
      `
        SELECT ticket_id, body, author_role, created_at
        FROM support_ticket_messages
        ORDER BY created_at DESC
      `
    ),
    query(
      `
        SELECT ticket_id, COUNT(*) AS unread_notifications
        FROM support_notifications
        WHERE user_id = $1
          AND read_at IS NULL
        GROUP BY ticket_id
      `,
      [viewerUserId]
    ),
  ]);

  const messageCountMap = new Map(
    messageCountRows.rows.map((row) => [row.ticket_id, Number(row.total_messages || 0)])
  );
  const latestMessageMap = new Map();

  latestMessageRows.rows.forEach((row) => {
    if (!latestMessageMap.has(row.ticket_id)) {
      latestMessageMap.set(row.ticket_id, row);
    }
  });

  const unreadMap = new Map(
    unreadRows.rows.map((row) => [row.ticket_id, Number(row.unread_notifications || 0)])
  );

  return rows.map((row) =>
    serializeTicketSummary({
      ...row,
      total_messages: messageCountMap.get(row.id) || 0,
      latest_message_body: latestMessageMap.get(row.id)?.body || null,
      latest_message_author_role: latestMessageMap.get(row.id)?.author_role || null,
      unread_notifications: unreadMap.get(row.id) || 0,
    })
  );
};

const listTicketMessages = async (ticketId) => {
  const { rows } = await query(
    `
      SELECT
        support_ticket_messages.*,
        users.full_name AS author_name,
        users.email AS author_email
      FROM support_ticket_messages
      INNER JOIN users
        ON users.id = support_ticket_messages.user_id
      WHERE support_ticket_messages.ticket_id = $1
      ORDER BY support_ticket_messages.created_at ASC
    `,
    [ticketId]
  );

  return rows.map(serializeMessage);
};

const getTicketDetailPayload = async (user, ticketId) => {
  const ticket = await ensureTicketAccess(user, ticketId);

  await query(
    `
      UPDATE support_notifications
      SET read_at = COALESCE(read_at, NOW()),
          updated_at = NOW()
      WHERE user_id = $1
        AND ticket_id = $2
        AND read_at IS NULL
    `,
    [user.id, ticketId]
  );

  const messages = await listTicketMessages(ticketId);

  return {
    ticket: {
      id: ticket.id,
      reference: ticket.reference,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      last_message_at: ticket.last_message_at,
      provider: {
        id: ticket.provider_user_id,
        full_name: ticket.provider_name,
        email: ticket.provider_email,
      },
      created_by: {
        id: ticket.created_by_user_id,
        full_name: ticket.created_by_name,
        email: ticket.created_by_email,
      },
      messages,
    },
  };
};

export const listSupportCountersByProvider = async () => {
  const [openRows, inProgressRows, unreadProviderRows] = await Promise.all([
    query(
      `
        SELECT provider_user_id, COUNT(*) AS total
        FROM support_tickets
        WHERE status = 'open'
        GROUP BY provider_user_id
      `
    ),
    query(
      `
        SELECT provider_user_id, COUNT(*) AS total
        FROM support_tickets
        WHERE status = 'in_progress'
        GROUP BY provider_user_id
      `
    ),
    query(
      `
        SELECT support_tickets.provider_user_id, COUNT(*) AS total
        FROM support_notifications
        INNER JOIN support_tickets
          ON support_tickets.id = support_notifications.ticket_id
        WHERE support_notifications.user_id = support_tickets.provider_user_id
          AND support_notifications.read_at IS NULL
        GROUP BY support_tickets.provider_user_id
      `
    ),
  ]);

  return {
    openTickets: mapCountRows(openRows.rows),
    inProgressTickets: mapCountRows(inProgressRows.rows),
    unreadProviderNotifications: mapCountRows(unreadProviderRows.rows),
  };
};

export const getSupportSnapshotForProvider = async (providerUserId) => {
  const [tickets, notifications] = await Promise.all([
    listTicketSummaries({ viewerUserId: providerUserId, providerUserId }),
    listSupportNotifications(providerUserId, 6),
  ]);

  return {
    metrics: buildSupportMetrics(tickets, notifications),
    recentTickets: tickets.slice(0, 6),
    notifications,
  };
};

export const getSupportOverviewForUser = async (user) => {
  const role = ensureSupportUser(user);
  const providerUserId = role === "provider" ? user.id : null;
  const [tickets, notifications, providersResult] = await Promise.all([
    listTicketSummaries({ viewerUserId: user.id, providerUserId }),
    listSupportNotifications(user.id),
    role === "super_admin"
      ? query(
          `
            SELECT id, full_name, email
            FROM users
            WHERE account_role = 'provider'
              AND archived_at IS NULL
            ORDER BY full_name ASC
          `
        )
      : Promise.resolve({ rows: [] }),
  ]);

  return {
    role,
    metrics: buildSupportMetrics(tickets, notifications),
    notifications,
    tickets,
    providers: providersResult.rows || [],
  };
};

export const getSupportTicketForUser = async (user, ticketId) =>
  getTicketDetailPayload(user, ticketId);

export const createSupportTicketForProvider = async (user, payload = {}) => {
  const role = ensureSupportUser(user);

  if (role !== "provider") {
    throw new HttpError(403, "Seul un prestataire peut creer un ticket.");
  }

  const subject = normalizeText(payload.subject);
  const message = normalizeText(payload.message);
  const category = normalizeCategory(payload.category);

  if (!subject) {
    throw new HttpError(400, "Le sujet du ticket est obligatoire.");
  }

  if (!message) {
    throw new HttpError(400, "Le premier message du ticket est obligatoire.");
  }

  const ticketId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const reference = createTicketReference();
  const now = new Date().toISOString();

  await query(
    `
      INSERT INTO support_tickets (
        id,
        reference,
        provider_user_id,
        created_by_user_id,
        subject,
        category,
        status,
        last_message_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $3, $4, $5, 'open', $6, $6, $6)
    `,
    [ticketId, reference, user.id, subject, category, now]
  );

  await query(
    `
      INSERT INTO support_ticket_messages (
        id,
        ticket_id,
        user_id,
        author_role,
        body,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'provider', $4, $5, $5)
    `,
    [messageId, ticketId, user.id, message, now]
  );

  await notifySuperAdminsAboutNewTicket({
    ticketId,
    subject,
    providerName: user.full_name || user.email,
  });

  return getTicketDetailPayload(user, ticketId);
};

export const postSupportTicketMessageForUser = async (user, ticketId, payload = {}) => {
  const role = ensureSupportUser(user);
  const ticket = await ensureTicketAccess(user, ticketId);
  const message = normalizeText(payload.message);

  if (!message) {
    throw new HttpError(400, "Le message est obligatoire.");
  }

  const nextStatus =
    role === "super_admin"
      ? normalizeTicketStatus(
          payload.status || (ticket.status === "open" ? "in_progress" : ticket.status),
          ticket.status
        )
      : ticket.status === "closed"
        ? "open"
        : ticket.status;
  const now = new Date().toISOString();

  await query(
    `
      INSERT INTO support_ticket_messages (
        id,
        ticket_id,
        user_id,
        author_role,
        body,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6)
    `,
    [crypto.randomUUID(), ticketId, user.id, role, message, now]
  );

  await query(
    `
      UPDATE support_tickets
      SET status = $2,
          last_message_at = $3,
          updated_at = $3
      WHERE id = $1
    `,
    [ticketId, nextStatus, now]
  );

  if (role === "super_admin") {
    await notifyProviderAboutAdminReply({
      providerUserId: ticket.provider_user_id,
      ticketId,
      subject: ticket.subject,
    });
  }

  return getTicketDetailPayload(user, ticketId);
};

export const updateSupportTicketStatusForAdmin = async (user, ticketId, status) => {
  const role = ensureSupportUser(user);

  if (role !== "super_admin") {
    throw new HttpError(403, "Seul le super admin peut modifier directement le statut.");
  }

  await ensureTicketAccess(user, ticketId);
  const nextStatus = normalizeTicketStatus(status);

  await query(
    `
      UPDATE support_tickets
      SET status = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [ticketId, nextStatus]
  );

  return getTicketDetailPayload(user, ticketId);
};

export const markSupportNotificationAsRead = async (userId, notificationId) => {
  const { rows } = await query(
    `
      UPDATE support_notifications
      SET read_at = COALESCE(read_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
      RETURNING id
    `,
    [notificationId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Notification introuvable.");
  }

  return { id: notificationId };
};
