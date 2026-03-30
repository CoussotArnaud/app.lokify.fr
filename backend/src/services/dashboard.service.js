import { query } from "../config/db.js";

const toNumber = (value) => Number(value || 0);

export const getDashboardOverview = async (userId) => {
  const [
    reservationsResult,
    reservationLinesResult,
    stockResult,
    recentResult,
    upcomingResult,
  ] = await Promise.all([
    query("SELECT id, item_id, status, total_amount FROM reservations WHERE user_id = $1", [userId]),
    query(
      `
        SELECT reservation_lines.reservation_id, reservation_lines.item_id
        FROM reservation_lines
        INNER JOIN reservations ON reservations.id = reservation_lines.reservation_id
        WHERE reservations.user_id = $1
      `,
      [userId]
    ),
    query("SELECT COALESCE(SUM(stock), 0) AS total_stock FROM items WHERE user_id = $1", [userId]),
    query(
      `
        SELECT
          reservations.id,
          reservations.status,
          reservations.start_date,
          reservations.end_date,
          reservations.total_amount,
          clients.first_name || ' ' || clients.last_name AS client_name,
          items.name AS item_name
        FROM reservations
        INNER JOIN clients ON clients.id = reservations.client_id
        INNER JOIN items ON items.id = reservations.item_id
        WHERE reservations.user_id = $1
        ORDER BY reservations.created_at DESC
        LIMIT 5
      `,
      [userId]
    ),
    query(
      `
        SELECT
          reservations.id,
          reservations.status,
          reservations.start_date,
          reservations.end_date,
          clients.first_name || ' ' || clients.last_name AS client_name,
          items.name AS item_name
        FROM reservations
        INNER JOIN clients ON clients.id = reservations.client_id
        INNER JOIN items ON items.id = reservations.item_id
        WHERE reservations.user_id = $1
          AND reservations.end_date >= NOW()
          AND reservations.status <> 'cancelled'
        ORDER BY reservations.start_date ASC
        LIMIT 5
      `,
      [userId]
    ),
  ]);

  const reservations = reservationsResult.rows;
  const reservationLines = reservationLinesResult.rows;
  const activeStatuses = new Set(["draft", "confirmed", "completed", "pending"]);
  const revenueStatuses = new Set(["confirmed", "completed"]);
  const usedItems = new Set();

  reservations
    .filter((reservation) => activeStatuses.has(reservation.status))
    .forEach((reservation) => {
      const linkedLines = reservationLines.filter((line) => line.reservation_id === reservation.id);

      if (linkedLines.length) {
        linkedLines.forEach((line) => usedItems.add(line.item_id));
        return;
      }

      if (reservation.item_id) {
        usedItems.add(reservation.item_id);
      }
    });

  const totalRevenue = reservations
    .filter((reservation) => revenueStatuses.has(reservation.status))
    .reduce((sum, reservation) => sum + Number(reservation.total_amount || 0), 0);
  const draftReservations = reservations.filter((reservation) =>
    ["draft", "pending"].includes(reservation.status)
  ).length;

  return {
    stats: {
      total_reservations: reservations.length,
      total_revenue: toNumber(totalRevenue),
      used_items: usedItems.size,
      draft_reservations: draftReservations,
      total_stock: toNumber(stockResult.rows[0]?.total_stock),
    },
    recent_reservations: recentResult.rows,
    upcoming_reservations: upcomingResult.rows,
  };
};
