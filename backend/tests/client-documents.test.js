import assert from "node:assert/strict";
import test from "node:test";

import { query } from "../src/config/db.js";
import {
  createClientDocument,
  deleteClientDocument,
  getClientDocument,
  listClientDocuments,
} from "../src/services/client-documents.service.js";

const getDemoUserId = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE account_role = 'provider' ORDER BY created_at ASC LIMIT 1"
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

test("client files can be uploaded, opened and removed", async () => {
  const userId = await getDemoUserId();
  const clientId = await getFirstClientId(userId);
  const createdDocument = await createClientDocument(userId, clientId, {
    title: "Permis de conduire",
    file_name: "permis.txt",
    capture_source: "upload",
    notes: "Document de test",
    data_url: "data:text/plain;base64,SGVsbG8gTE9LSUZZ",
  });

  assert.ok(createdDocument.id);
  assert.equal(createdDocument.title, "Permis de conduire");
  assert.ok(createdDocument.data_url.startsWith("data:text/plain;base64,"));

  const listedDocuments = await listClientDocuments(userId, clientId);
  assert.ok(listedDocuments.some((document) => document.id === createdDocument.id));

  const openedDocument = await getClientDocument(userId, clientId, createdDocument.id);
  assert.equal(openedDocument.file_name, "permis.txt");
  assert.equal(openedDocument.notes, "Document de test");

  await deleteClientDocument(userId, clientId, createdDocument.id);

  const remainingDocuments = await listClientDocuments(userId, clientId);
  assert.ok(!remainingDocuments.some((document) => document.id === createdDocument.id));
});
