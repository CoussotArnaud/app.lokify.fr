import crypto from "crypto";

import { pool, query } from "../config/db.js";
import HttpError from "../utils/http-error.js";

export const defaultReservationStatuses = [
  {
    code: "pending",
    label: "Non paye / En attente",
    color: "#D64F4F",
    position: 0,
  },
  {
    code: "draft",
    label: "A finaliser",
    color: "#E39B2E",
    position: 1,
  },
  {
    code: "confirmed",
    label: "Confirme / Pret",
    color: "#1C9C6B",
    position: 2,
  },
  {
    code: "completed",
    label: "Termine",
    color: "#2F7DE1",
    position: 3,
  },
  {
    code: "cancelled",
    label: "Annule",
    color: "#7A869A",
    position: 4,
  },
];

const statusCodes = new Set(defaultReservationStatuses.map((status) => status.code));
const hexColorPattern = /^#(?:[0-9a-fA-F]{6})$/;

export const ensureReservationStatuses = async (userId, executor = query) => {
  for (const status of defaultReservationStatuses) {
    await executor(
      `
        INSERT INTO custom_statuses (id, user_id, code, label, color, position)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, code) DO NOTHING
      `,
      [
        crypto.randomUUID(),
        userId,
        status.code,
        status.label,
        status.color,
        status.position,
      ]
    );
  }
};

export const listReservationStatuses = async (userId) => {
  await ensureReservationStatuses(userId);

  const { rows } = await query(
    `
      SELECT code, label, color, position
      FROM custom_statuses
      WHERE user_id = $1
      ORDER BY position ASC, created_at ASC
    `,
    [userId]
  );

  return rows;
};

const normalizeStatusesPayload = (statuses = []) => {
  if (!Array.isArray(statuses)) {
    throw new HttpError(400, "Le format des statuts personnalises est invalide.");
  }

  return statuses.map((status) => ({
    code: String(status.code ?? "").trim(),
    label: String(status.label ?? "").trim(),
    color: String(status.color ?? "").trim(),
  }));
};

export const updateReservationStatuses = async (userId, statuses) => {
  const normalizedStatuses = normalizeStatusesPayload(statuses);

  if (normalizedStatuses.length > 5) {
    throw new HttpError(400, "Un maximum de 5 statuts est autorise.");
  }

  for (const status of normalizedStatuses) {
    if (!statusCodes.has(status.code)) {
      throw new HttpError(400, "Un code de statut est invalide.");
    }

    if (!status.label) {
      throw new HttpError(400, "Le nom du statut est obligatoire.");
    }

    if (!hexColorPattern.test(status.color)) {
      throw new HttpError(400, "La couleur du statut doit etre au format hexadecimal.");
    }
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query("BEGIN");
    await ensureReservationStatuses(userId, dbClient.query.bind(dbClient));

    for (const [index, status] of normalizedStatuses.entries()) {
      await dbClient.query(
        `
          UPDATE custom_statuses
          SET label = $3,
              color = $4,
              position = $5
          WHERE user_id = $1
            AND code = $2
        `,
        [userId, status.code, status.label, status.color, index]
      );
    }

    await dbClient.query("COMMIT");
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }

  return listReservationStatuses(userId);
};
