import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";

const planningSelect = `
  SELECT
    reservations.*,
    clients.first_name || ' ' || clients.last_name AS client_name,
    items.name AS item_name
  FROM reservations
  INNER JOIN clients ON clients.id = reservations.client_id
  INNER JOIN items ON items.id = reservations.item_id
`;

const buildDefaultRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { start, end };
};

export const getPlanning = async (userId, { start, end }) => {
  const defaultRange = buildDefaultRange();
  const startDate = start ? new Date(start) : defaultRange.start;
  const endDate = end ? new Date(end) : defaultRange.end;

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    throw new HttpError(400, "Periode de planning invalide.");
  }

  const { rows } = await query(
    `
      ${planningSelect}
      WHERE reservations.user_id = $1
        AND reservations.start_date < $3
        AND reservations.end_date > $2
      ORDER BY reservations.start_date ASC
    `,
    [userId, startDate.toISOString(), endDate.toISOString()]
  );

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    reservations: rows,
  };
};

