import { query } from "../config/db.js";

const toNumber = (value) => Number(value || 0);

export const getDashboardOverview = async (userId) => {
  const [reservationsResult, stockResult, recentResult, upcomingResult] = await Promise.all([
    query("SELECT item_id, status, total_amount FROM reservations WHERE user_id = $1", [userId]),
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
  const activeStatuses = new Set(["draft", "confirmed", "completed"]);
  const revenueStatuses = new Set(["confirmed", "completed"]);
  const usedItems = new Set(
    reservations.filter((reservation) => activeStatuses.has(reservation.status)).map((reservation) => reservation.item_id)
  );
  const totalRevenue = reservations
    .filter((reservation) => revenueStatuses.has(reservation.status))
    .reduce((sum, reservation) => sum + Number(reservation.total_amount || 0), 0);
  const draftReservations = reservations.filter((reservation) => reservation.status === "draft").length;

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
