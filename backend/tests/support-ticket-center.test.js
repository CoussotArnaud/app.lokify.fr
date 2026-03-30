import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { loginUser } from "../src/services/auth.service.js";
import { getProviderForAdmin } from "../src/services/admin.service.js";
import {
  createSupportTicketForProvider,
  getSupportOverviewForUser,
  getSupportTicketForUser,
  postSupportTicketMessageForUser,
} from "../src/services/support.service.js";

test("provider can create a support ticket and super admin sees the notification", async () => {
  const providerLogin = await loginUser({
    email: "presta@lokify.fr",
    password: "presta",
  });
  const adminLogin = await loginUser({
    email: "team@lokify.fr",
    password: "admin",
  });

  const created = await createSupportTicketForProvider(providerLogin.user, {
    subject: `Blocage catalogue ${crypto.randomUUID().slice(0, 6)}`,
    category: "technical",
    message: "Bonjour, j'ai besoin d'aide sur le catalogue de test.",
  });

  assert.equal(created.ticket.status, "open");
  assert.equal(created.ticket.messages.length, 1);

  const adminOverview = await getSupportOverviewForUser(adminLogin.user);

  assert.ok(adminOverview.tickets.some((ticket) => ticket.id === created.ticket.id));
  assert.ok(
    adminOverview.notifications.some(
      (notification) =>
        notification.ticket_id === created.ticket.id &&
        notification.notification_type === "support_ticket_created"
    )
  );
});

test("admin reply notifies provider and provider detail marks the notification as read", async () => {
  const providerLogin = await loginUser({
    email: "presta@lokify.fr",
    password: "presta",
  });
  const adminLogin = await loginUser({
    email: "team@lokify.fr",
    password: "admin",
  });

  const created = await createSupportTicketForProvider(providerLogin.user, {
    subject: `Question abonnement ${crypto.randomUUID().slice(0, 6)}`,
    category: "billing",
    message: "Pouvez-vous me confirmer ma prochaine echeance ?",
  });

  const replied = await postSupportTicketMessageForUser(adminLogin.user, created.ticket.id, {
    message: "Oui, la prochaine echeance est visible dans votre zone Facturation.",
    status: "in_progress",
  });

  assert.equal(replied.ticket.status, "in_progress");
  assert.equal(replied.ticket.messages.length, 2);

  const providerOverviewBeforeRead = await getSupportOverviewForUser(providerLogin.user);
  const providerNotification = providerOverviewBeforeRead.notifications.find(
    (notification) =>
      notification.ticket_id === created.ticket.id &&
      notification.notification_type === "support_ticket_reply" &&
      !notification.read_at
  );

  assert.ok(providerNotification);

  const providerTicketDetail = await getSupportTicketForUser(providerLogin.user, created.ticket.id);

  assert.equal(providerTicketDetail.ticket.messages.length, 2);

  const providerOverviewAfterRead = await getSupportOverviewForUser(providerLogin.user);
  const unreadTicket = providerOverviewAfterRead.tickets.find(
    (ticket) => ticket.id === created.ticket.id
  );

  assert.equal(unreadTicket.unread_notifications, 0);
});

test("admin provider detail includes the support snapshot for support and billing follow-up", async () => {
  const providerLogin = await loginUser({
    email: "presta@lokify.fr",
    password: "presta",
  });

  const detail = await getProviderForAdmin(providerLogin.user.id);

  assert.ok(detail.support);
  assert.ok(detail.support_snapshot);
  assert.ok(detail.support_snapshot.metrics.totalTickets >= 1);
  assert.ok(Array.isArray(detail.support_snapshot.recentTickets));
});
