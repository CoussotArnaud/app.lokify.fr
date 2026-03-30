import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { query } from "../src/config/db.js";
import {
  archiveClient,
  createClient,
  listClients,
  restoreClient,
} from "../src/services/clients.service.js";
import { purgeExpiredArchivedRecords } from "../src/services/archive-maintenance.service.js";
import { createReservation } from "../src/services/reservations.service.js";

const getDemoUserId = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE account_role = 'provider' ORDER BY created_at ASC LIMIT 1"
  );
  return rows[0].id;
};

const getFirstItemId = async (userId) => {
  const { rows } = await query(
    "SELECT id FROM items WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
    [userId]
  );

  return rows[0].id;
};

const getItemIdByName = async (userId, name) => {
  const { rows } = await query(
    "SELECT id FROM items WHERE user_id = $1 AND name = $2 LIMIT 1",
    [userId, name]
  );

  return rows[0].id;
};

const getFirstClientId = async (userId) => {
  const { rows } = await query(
    "SELECT id FROM clients WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
    [userId]
  );

  return rows[0].id;
};

test("createClient normalizes fields and blocks gross duplicates", async () => {
  const userId = await getDemoUserId();
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const createdClient = await createClient(userId, {
    first_name: "  Lea  ",
    last_name: "  Durant ",
    email: `LEA.${uniqueToken}@example.com `,
    phone: "06 11 22 33 44",
  });

  assert.equal(createdClient.first_name, "Lea");
  assert.equal(createdClient.last_name, "Durant");
  assert.equal(createdClient.email, `lea.${uniqueToken}@example.com`);

  await assert.rejects(
    () =>
      createClient(userId, {
        first_name: "Lea",
        last_name: "Durant",
        email: `lea.${uniqueToken}@example.com`,
        phone: "07 99 88 77 66",
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /adresse email/i);
      return true;
    }
  );

  await assert.rejects(
    () =>
      createClient(userId, {
        first_name: "Autre",
        last_name: "Contact",
        email: `autre.${uniqueToken}@example.com`,
        phone: "+33 6 11 22 33 44",
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /numero de telephone/i);
      return true;
    }
  );
});

test("createReservation still works with an existing client", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const itemId = await getFirstItemId(userId);
  const startDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);

  const reservation = await createReservation(userId, {
    client_id: clientId,
    item_id: itemId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "draft",
    notes: "Test existant",
  });

  assert.equal(reservation.client_id, clientId);
  assert.equal(reservation.item_id, itemId);
  assert.match(reservation.client_name, /\S+/);
});

test("createReservation links a freshly created client", async () => {
  const userId = await getDemoUserId();
  const itemId = await getFirstItemId(userId);
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const client = await createClient(userId, {
    first_name: "Nora",
    last_name: "Petit",
    email: `nora.${uniqueToken}@example.com`,
    phone: "06 55 44 33 22",
  });
  const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);

  const reservation = await createReservation(userId, {
    client_id: client.id,
    item_id: itemId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "draft",
    notes: "Test nouveau client",
  });

  assert.equal(reservation.client_id, client.id);
  assert.equal(reservation.item_id, itemId);
  assert.match(reservation.client_name, /Nora Petit/);
});

test("createReservation supports a dossier with multiple reservation lines", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const photoboothId = await getItemIdByName(userId, "Photobooth Premium");
  const trottinetteId = await getItemIdByName(userId, "Trottinette Electrique");
  const startDate = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 42 * 24 * 60 * 60 * 1000);

  const reservation = await createReservation(userId, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "draft",
    source: "manual",
    fulfillment_mode: "pickup",
    notes: "Pack multi-produits",
    lines: [
      { item_id: photoboothId, quantity: 1 },
      { item_id: trottinetteId, quantity: 2 },
    ],
  });

  assert.equal(reservation.client_id, clientId);
  assert.equal(reservation.item_id, photoboothId);
  assert.equal(reservation.lines.length, 2);
  assert.equal(reservation.total_quantity, 3);
  assert.equal(reservation.total_amount, 760);
  assert.equal(reservation.total_deposit, 800);
  assert.equal(reservation.deposit_tracking.handling_mode, "manual");
  assert.equal(reservation.deposit_tracking.manual_status, "pending");
  assert.equal(reservation.deposit_tracking.calculated_amount, 800);
  assert.match(reservation.item_name, /Photobooth Premium/);
});

test("createReservation now checks overlapping availability by quantity", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const photoboothId = await getItemIdByName(userId, "Photobooth Premium");
  const startDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 61 * 24 * 60 * 60 * 1000);

  const firstReservation = await createReservation(userId, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "confirmed",
    notes: "Stock test 1",
    lines: [{ item_id: photoboothId, quantity: 1 }],
  });

  const secondReservation = await createReservation(userId, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "confirmed",
    notes: "Stock test 2",
    lines: [{ item_id: photoboothId, quantity: 1 }],
  });

  assert.equal(firstReservation.lines[0].quantity, 1);
  assert.equal(secondReservation.lines[0].quantity, 1);

  await assert.rejects(
    () =>
      createReservation(userId, {
        client_id: clientId,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: "confirmed",
        notes: "Stock test 3",
        lines: [{ item_id: photoboothId, quantity: 1 }],
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /disponibilite/i);
      return true;
    }
  );
});

test("pending reservations also block availability on overlapping dates", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const photoboothId = await getItemIdByName(userId, "Photobooth Premium");
  const startDate = new Date(Date.now() + 80 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 81 * 24 * 60 * 60 * 1000);

  const reservation = await createReservation(userId, {
    client_id: clientId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "pending",
    notes: "Stock pending 1",
    lines: [{ item_id: photoboothId, quantity: 2 }],
  });

  assert.equal(reservation.status, "pending");
  assert.equal(reservation.lines[0].quantity, 2);

  await assert.rejects(
    () =>
      createReservation(userId, {
        client_id: clientId,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: "draft",
        notes: "Stock pending 2",
        lines: [{ item_id: photoboothId, quantity: 1 }],
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /disponibilite/i);
      return true;
    }
  );
});

test("archiving a client hides it from active lists and restore re-enables reservations", async () => {
  const userId = await getDemoUserId();
  const itemId = await getFirstItemId(userId);
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const client = await createClient(userId, {
    first_name: "Archive",
    last_name: "Client",
    email: `archive-client.${uniqueToken}@example.com`,
    phone: "06 44 55 66 77",
  });

  const archivedClient = await archiveClient(userId, client.id, {
    actorUserId: userId,
    archiveReason: "Test archivage client",
  });
  const activeClients = await listClients(userId, { scope: "active" });
  const archivedClients = await listClients(userId, { scope: "archived" });
  const startDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);

  assert.equal(archivedClient.archive.isArchived, true);
  assert.ok(
    !activeClients.some((entry) => entry.id === client.id),
    "Le client archive ne doit plus apparaitre dans la liste active."
  );
  assert.ok(
    archivedClients.some((entry) => entry.id === client.id),
    "Le client archive doit apparaitre dans la liste archivee."
  );

  await assert.rejects(
    () =>
      createReservation(userId, {
        client_id: client.id,
        item_id: itemId,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: "draft",
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /archive/i);
      return true;
    }
  );

  const restoredClient = await restoreClient(userId, client.id, {
    actorUserId: userId,
    restoreReason: "Test restauration client",
  });
  const reservation = await createReservation(userId, {
    client_id: client.id,
    item_id: itemId,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    status: "draft",
  });

  assert.equal(restoredClient.archive.isArchived, false);
  assert.equal(reservation.client_id, client.id);
});

test("purge removes an archived client only after the retention deadline and logs the operation", async () => {
  const userId = await getDemoUserId();
  const uniqueToken = crypto.randomUUID().slice(0, 8);
  const client = await createClient(userId, {
    first_name: "Purge",
    last_name: "Client",
    email: `purge-client.${uniqueToken}@example.com`,
    phone: "06 99 88 77 11",
  });

  await archiveClient(userId, client.id, {
    actorUserId: userId,
    archiveReason: "Test purge client",
  });

  const pastDate = new Date("2010-01-01T00:00:00.000Z").toISOString();
  await query(
    `
      UPDATE clients
      SET archived_at = $2,
          scheduled_purge_at = $3
      WHERE id = $1
    `,
    [client.id, pastDate, pastDate]
  );

  const purgeResult = await purgeExpiredArchivedRecords({
    now: "2026-03-29T03:00:00.000Z",
    purgeTrigger: "test",
  });
  const clientLookup = await query("SELECT id FROM clients WHERE id = $1 LIMIT 1", [client.id]);
  const purgeLog = await query(
    `
      SELECT *
      FROM archive_purge_logs
      WHERE entity_type = 'client'
        AND entity_id = $1
      ORDER BY purged_at DESC
      LIMIT 1
    `,
    [client.id]
  );

  assert.equal(purgeResult.totalPurgedClients >= 1, true);
  assert.equal(clientLookup.rows.length, 0);
  assert.equal(purgeLog.rows.length, 1);
  assert.equal(purgeLog.rows[0].purge_trigger, "test");
});
