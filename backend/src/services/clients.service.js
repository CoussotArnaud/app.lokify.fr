import crypto from "crypto";

import { query } from "../config/db.js";
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
      SELECT id, first_name, last_name, email, phone
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

export const listClients = async (userId) => {
  const { rows } = await query(
    "SELECT * FROM clients WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );

  return rows;
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
      RETURNING *
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

  return rows[0];
};

export const updateClient = async (userId, clientId, payload) => {
  const client = normalizeClientPayload(payload);
  validateClient(client);
  await ensureNoDuplicateClient(userId, client, clientId);

  const { rows } = await query(
    `
      UPDATE clients
      SET first_name = $3,
          last_name = $4,
          email = $5,
          phone = $6,
          address = $7,
          notes = $8
      WHERE id = $1 AND user_id = $2
      RETURNING *
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

  if (!rows[0]) {
    throw new HttpError(404, "Client introuvable.");
  }

  return rows[0];
};

export const deleteClient = async (userId, clientId) => {
  const { rows } = await query(
    "DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id",
    [clientId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Client introuvable.");
  }
};
