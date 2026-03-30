import crypto from "crypto";

import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";

const allowedStatuses = new Set(["available", "reserved", "maintenance", "unavailable"]);

const normalizeItemPayload = (payload = {}) => ({
  name: String(payload.name ?? "").trim(),
  category: String(payload.category ?? "").trim(),
  stock: Number(payload.stock ?? 0),
  status: String(payload.status ?? "available").trim() || "available",
  price: Number(payload.price ?? 0),
  deposit: Number(payload.deposit ?? 0),
});

const validateItem = (item) => {
  if (!item.name) {
    throw new HttpError(400, "Le nom du produit est obligatoire.");
  }

  if (!Number.isFinite(item.stock) || item.stock < 0) {
    throw new HttpError(400, "Le stock doit etre un entier positif.");
  }

  if (!Number.isFinite(item.price) || item.price < 0) {
    throw new HttpError(400, "Le prix doit etre positif.");
  }

  if (!Number.isFinite(item.deposit) || item.deposit < 0) {
    throw new HttpError(400, "La caution doit etre positive.");
  }

  if (!allowedStatuses.has(item.status)) {
    throw new HttpError(400, "Statut materiel invalide.");
  }
};

export const listItems = async (userId) => {
  const { rows } = await query(
    "SELECT * FROM items WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );

  return rows;
};

export const createItem = async (userId, payload) => {
  const item = normalizeItemPayload(payload);
  validateItem(item);
  const itemId = crypto.randomUUID();

  const { rows } = await query(
    `
      INSERT INTO items (id, user_id, name, category, stock, status, price, deposit)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      itemId,
      userId,
      item.name,
      item.category,
      item.stock,
      item.status,
      item.price,
      item.deposit,
    ]
  );

  return rows[0];
};

export const updateItem = async (userId, itemId, payload) => {
  const item = normalizeItemPayload(payload);
  validateItem(item);

  const { rows } = await query(
    `
      UPDATE items
      SET name = $3,
          category = $4,
          stock = $5,
          status = $6,
          price = $7,
          deposit = $8
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
    [itemId, userId, item.name, item.category, item.stock, item.status, item.price, item.deposit]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Materiel introuvable.");
  }

  return rows[0];
};

export const deleteItem = async (userId, itemId) => {
  const { rows } = await query(
    "DELETE FROM items WHERE id = $1 AND user_id = $2 RETURNING id",
    [itemId, userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Materiel introuvable.");
  }
};
