import crypto from "crypto";

import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";

const allowedCaptureSources = new Set(["upload", "camera"]);
const maxFileSize = 5 * 1024 * 1024;

const normalizeText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const ensureClientOwnedByUser = async (userId, clientId) => {
  const { rows } = await query(
    `
      SELECT id, first_name, last_name, archived_at
      FROM clients
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [clientId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Client introuvable.");
  }

  return rows[0];
};

const ensureClientCanBeModified = (client) => {
  if (client.archived_at) {
    throw new HttpError(
      409,
      "Ce client est archive. Restaurez-le avant de modifier ses documents."
    );
  }
};

const parseDataUrl = (dataUrl) => {
  const normalizedDataUrl = String(dataUrl || "");
  const match = normalizedDataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new HttpError(400, "Le fichier envoye est invalide.");
  }

  return {
    mime_type: match[1],
    content_base64: match[2],
  };
};

const normalizeDocumentPayload = (payload = {}) => {
  const fileName = normalizeText(payload.file_name ?? payload.fileName ?? "");
  const title = normalizeText(payload.title || fileName);
  const captureSource = normalizeText(payload.capture_source ?? payload.captureSource ?? "upload").toLowerCase();
  const notes = normalizeText(payload.notes);
  const parsedFile =
    payload.data_url || payload.dataUrl
      ? parseDataUrl(payload.data_url ?? payload.dataUrl)
      : {
          mime_type: normalizeText(payload.mime_type ?? payload.mimeType ?? ""),
          content_base64: normalizeText(payload.content_base64 ?? payload.contentBase64 ?? ""),
        };

  if (!allowedCaptureSources.has(captureSource)) {
    throw new HttpError(400, "Source de capture invalide.");
  }

  if (!fileName || !parsedFile.mime_type || !parsedFile.content_base64) {
    throw new HttpError(400, "Le fichier client est incomplet.");
  }

  let fileSize = 0;

  try {
    fileSize = Buffer.from(parsedFile.content_base64, "base64").byteLength;
  } catch (_error) {
    throw new HttpError(400, "Le contenu du fichier client est invalide.");
  }

  if (!fileSize || fileSize > maxFileSize) {
    throw new HttpError(400, "Le fichier depasse la limite autorisee de 5 Mo.");
  }

  return {
    title: title || fileName,
    file_name: fileName,
    mime_type: parsedFile.mime_type,
    content_base64: parsedFile.content_base64,
    file_size: fileSize,
    capture_source: captureSource,
    notes: notes || null,
  };
};

const serializeClientDocument = (row) => ({
  id: row.id,
  client_id: row.client_id,
  user_id: row.user_id,
  title: row.title,
  file_name: row.file_name,
  mime_type: row.mime_type,
  file_size: Number(row.file_size || 0),
  capture_source: row.capture_source || "upload",
  notes: row.notes || "",
  data_url: `data:${row.mime_type};base64,${row.content_base64}`,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const listClientDocuments = async (userId, clientId) => {
  await ensureClientOwnedByUser(userId, clientId);
  const { rows } = await query(
    `
      SELECT *
      FROM client_documents
      WHERE user_id = $1
        AND client_id = $2
      ORDER BY created_at DESC
    `,
    [userId, clientId]
  );

  return rows.map(serializeClientDocument);
};

export const getClientDocument = async (userId, clientId, documentId) => {
  await ensureClientOwnedByUser(userId, clientId);
  const { rows } = await query(
    `
      SELECT *
      FROM client_documents
      WHERE user_id = $1
        AND client_id = $2
        AND id = $3
      LIMIT 1
    `,
    [userId, clientId, documentId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Document client introuvable.");
  }

  return serializeClientDocument(rows[0]);
};

export const createClientDocument = async (userId, clientId, payload = {}) => {
  const client = await ensureClientOwnedByUser(userId, clientId);
  ensureClientCanBeModified(client);
  const document = normalizeDocumentPayload(payload);
  const documentId = crypto.randomUUID();

  const { rows } = await query(
    `
      INSERT INTO client_documents (
        id,
        client_id,
        user_id,
        title,
        file_name,
        mime_type,
        file_size,
        capture_source,
        notes,
        content_base64
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `,
    [
      documentId,
      clientId,
      userId,
      document.title,
      document.file_name,
      document.mime_type,
      document.file_size,
      document.capture_source,
      document.notes,
      document.content_base64,
    ]
  );

  return serializeClientDocument(rows[0]);
};

export const deleteClientDocument = async (userId, clientId, documentId) => {
  const client = await ensureClientOwnedByUser(userId, clientId);
  ensureClientCanBeModified(client);
  const { rows } = await query(
    `
      DELETE FROM client_documents
      WHERE user_id = $1
        AND client_id = $2
        AND id = $3
      RETURNING id
    `,
    [userId, clientId, documentId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Document client introuvable.");
  }

  return { success: true };
};
