import { query } from "../config/db.js";
import { deliverEmail } from "./mail-delivery.service.js";

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

const bookingDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Paris",
});

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const formatMoney = (value) => moneyFormatter.format(roundMoney(value));

const formatDateTime = (value) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return dateFormatter.format(date);
};

const formatBookingDate = (value) => {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return bookingDateFormatter.format(date);
};

const computeTaxBreakdown = (ttcAmount, vatRate) => {
  const normalizedTtc = roundMoney(ttcAmount);
  const normalizedVatRate = Number.isFinite(Number(vatRate)) ? Math.max(Number(vatRate), 0) : 0;

  if (normalizedVatRate <= 0) {
    return {
      vatRate: 0,
      htAmount: normalizedTtc,
      vatAmount: 0,
      ttcAmount: normalizedTtc,
    };
  }

  const htAmount = roundMoney(normalizedTtc / (1 + normalizedVatRate / 100));
  const vatAmount = roundMoney(normalizedTtc - htAmount);

  return {
    vatRate: normalizedVatRate,
    htAmount,
    vatAmount,
    ttcAmount: normalizedTtc,
  };
};

const getProviderNotificationRecipient = async (userId) => {
  const { rows } = await query(
    `
      SELECT
        email,
        full_name,
        company_name,
        commercial_name
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (!rows[0]?.email) {
    return null;
  }

  const row = rows[0];
  const displayName =
    row.commercial_name || row.company_name || row.full_name || "Boutique Lokify";

  return {
    email: row.email,
    displayName,
  };
};

const listVatRatesByItemId = async (userId, itemIds = []) => {
  const uniqueItemIds = [...new Set(itemIds.filter(Boolean))];

  if (!uniqueItemIds.length) {
    return new Map();
  }

  const placeholders = uniqueItemIds.map((_, index) => `$${index + 2}`).join(", ");
  const { rows } = await query(
    `
      SELECT item_id, vat
      FROM item_profiles
      WHERE user_id = $1
        AND item_id IN (${placeholders})
    `,
    [userId, ...uniqueItemIds]
  );

  return new Map(rows.map((row) => [row.item_id, Number(row.vat || 0)]));
};

const buildReservationLineModels = (reservation, vatRatesByItemId) =>
  (Array.isArray(reservation?.lines) ? reservation.lines : []).map((line) => {
    const taxBreakdown = computeTaxBreakdown(
      Number(line.line_total || 0),
      vatRatesByItemId.get(line.item_id) || 0
    );

    return {
      name: line.item_name || "Produit",
      quantity: Number(line.quantity || 0),
      notes: String(line.notes || "").trim(),
      unitPriceTtc: roundMoney(line.unit_price),
      htAmount: taxBreakdown.htAmount,
      vatAmount: taxBreakdown.vatAmount,
      ttcAmount: taxBreakdown.ttcAmount,
      vatRate: taxBreakdown.vatRate,
    };
  });

const buildTotals = (lineModels = []) => {
  const totals = lineModels.reduce(
    (accumulator, line) => ({
      htAmount: accumulator.htAmount + line.htAmount,
      vatAmount: accumulator.vatAmount + line.vatAmount,
      ttcAmount: accumulator.ttcAmount + line.ttcAmount,
    }),
    {
      htAmount: 0,
      vatAmount: 0,
      ttcAmount: 0,
    }
  );

  return {
    htAmount: roundMoney(totals.htAmount),
    vatAmount: roundMoney(totals.vatAmount),
    ttcAmount: roundMoney(totals.ttcAmount),
  };
};

const buildEmailPayload = ({
  recipient,
  reservation,
  client,
  cartSummary,
  customerMessage,
  lineModels,
  totals,
}) => {
  const reservationCreatedAt = reservation?.created_at || new Date().toISOString();
  const reservationStatusLabel =
    reservation?.status === "confirmed"
      ? "Confirmee automatiquement"
      : "En attente de confirmation";
  const bookingPeriodLabel = `${formatBookingDate(reservation?.start_date)} -> ${formatBookingDate(
    reservation?.end_date
  )}`;
  const textLines = [
    `Bonjour ${recipient.displayName},`,
    "",
    "Une reservation vient d'etre effectuee depuis votre boutique en ligne.",
    "",
    `Reference: ${reservation?.reference || "n/a"}`,
    `Statut: ${reservationStatusLabel}`,
    `Date et heure de la demande: ${formatDateTime(reservationCreatedAt)}`,
    `Periode reservee: ${bookingPeriodLabel}`,
    "",
    "Coordonnees du client",
    `- Nom: ${client?.first_name || ""} ${client?.last_name || ""}`.trim(),
    `- Email: ${client?.email || ""}`,
    `- Telephone: ${client?.phone || "-"}`,
    `- Adresse: ${client?.address || "-"}`,
    "",
    cartSummary ? `Panier saisi: ${cartSummary}` : null,
    "Detail de la reservation",
    ...lineModels.flatMap((line) => [
      `- ${line.name} x${line.quantity}`,
      `  Prix unitaire TTC: ${formatMoney(line.unitPriceTtc)}`,
      `  TVA appliquee: ${line.vatRate}%`,
      `  Montant HT: ${formatMoney(line.htAmount)}`,
      `  TVA: ${formatMoney(line.vatAmount)}`,
      `  Montant TTC: ${formatMoney(line.ttcAmount)}`,
      line.notes ? `  Detail: ${line.notes}` : null,
    ]),
    "",
    "Recapitulatif",
    `- Total HT: ${formatMoney(totals.htAmount)}`,
    `- Total TVA: ${formatMoney(totals.vatAmount)}`,
    `- Total TTC: ${formatMoney(totals.ttcAmount)}`,
    `- Caution estimee: ${formatMoney(reservation?.total_deposit || 0)}`,
    customerMessage ? "" : null,
    customerMessage ? "Message du client" : null,
    customerMessage || null,
  ].filter(Boolean);

  const htmlRows = lineModels
    .map(
      (line) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e8ec;vertical-align:top;">
            <strong>${escapeHtml(line.name)}</strong><br />
            <span style="color:#5c6d76;">Quantite: ${escapeHtml(line.quantity)}</span>
            ${line.notes ? `<br /><span style="color:#5c6d76;">${escapeHtml(line.notes)}</span>` : ""}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e8ec;">${escapeHtml(
            `${line.vatRate}%`
          )}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e8ec;">${escapeHtml(
            formatMoney(line.htAmount)
          )}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e8ec;">${escapeHtml(
            formatMoney(line.vatAmount)
          )}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e3e8ec;">${escapeHtml(
            formatMoney(line.ttcAmount)
          )}</td>
        </tr>
      `
    )
    .join("");

  return {
    subject: `Lokify - nouvelle reservation boutique ${reservation?.reference || ""}`.trim(),
    text: textLines.join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #183041;">
        <p>Bonjour ${escapeHtml(recipient.displayName)},</p>
        <p>Une reservation vient d'etre effectuee depuis votre boutique en ligne.</p>

        <div style="padding:16px 18px;border:1px solid #e3e8ec;border-radius:16px;background:#f7fafb;">
          <p style="margin:0 0 6px;"><strong>Reference:</strong> ${escapeHtml(
            reservation?.reference || "n/a"
          )}</p>
          <p style="margin:0 0 6px;"><strong>Statut:</strong> ${escapeHtml(
            reservationStatusLabel
          )}</p>
          <p style="margin:0 0 6px;"><strong>Date et heure de la demande:</strong> ${escapeHtml(
            formatDateTime(reservationCreatedAt)
          )}</p>
          <p style="margin:0;"><strong>Periode reservee:</strong> ${escapeHtml(
            bookingPeriodLabel
          )}</p>
        </div>

        <h2 style="margin:24px 0 12px;font-size:18px;">Coordonnees du client</h2>
        <div style="padding:16px 18px;border:1px solid #e3e8ec;border-radius:16px;">
          <p style="margin:0 0 6px;"><strong>Nom:</strong> ${escapeHtml(
            `${client?.first_name || ""} ${client?.last_name || ""}`.trim()
          )}</p>
          <p style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(client?.email || "")}</p>
          <p style="margin:0 0 6px;"><strong>Telephone:</strong> ${escapeHtml(
            client?.phone || "-"
          )}</p>
          <p style="margin:0;"><strong>Adresse:</strong> ${escapeHtml(client?.address || "-")}</p>
        </div>

        ${
          cartSummary
            ? `<p style="margin:24px 0 0;"><strong>Panier saisi:</strong> ${escapeHtml(cartSummary)}</p>`
            : ""
        }

        <h2 style="margin:24px 0 12px;font-size:18px;">Detail de la reservation</h2>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e3e8ec;border-radius:16px;overflow:hidden;">
          <thead style="background:#f1f6f8;">
            <tr>
              <th align="left" style="padding:10px 12px;">Produit</th>
              <th align="left" style="padding:10px 12px;">TVA</th>
              <th align="left" style="padding:10px 12px;">HT</th>
              <th align="left" style="padding:10px 12px;">TVA</th>
              <th align="left" style="padding:10px 12px;">TTC</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows}
          </tbody>
        </table>

        <h2 style="margin:24px 0 12px;font-size:18px;">Recapitulatif</h2>
        <div style="padding:16px 18px;border:1px solid #e3e8ec;border-radius:16px;">
          <p style="margin:0 0 6px;"><strong>Total HT:</strong> ${escapeHtml(
            formatMoney(totals.htAmount)
          )}</p>
          <p style="margin:0 0 6px;"><strong>Total TVA:</strong> ${escapeHtml(
            formatMoney(totals.vatAmount)
          )}</p>
          <p style="margin:0 0 6px;"><strong>Total TTC:</strong> ${escapeHtml(
            formatMoney(totals.ttcAmount)
          )}</p>
          <p style="margin:0;"><strong>Caution estimee:</strong> ${escapeHtml(
            formatMoney(reservation?.total_deposit || 0)
          )}</p>
        </div>

        ${
          customerMessage
            ? `
              <h2 style="margin:24px 0 12px;font-size:18px;">Message du client</h2>
              <div style="padding:16px 18px;border:1px solid #e3e8ec;border-radius:16px;background:#fdfaf5;">
                ${escapeHtml(customerMessage).replace(/\n/g, "<br />")}
              </div>
            `
            : ""
        }
      </div>
    `,
  };
};

export const notifyProviderAboutStorefrontReservation = async ({
  userId,
  reservation,
  client,
  cartSummary = "",
  customerMessage = "",
}) => {
  const recipient = await getProviderNotificationRecipient(userId);

  if (!recipient?.email) {
    return null;
  }

  const vatRatesByItemId = await listVatRatesByItemId(
    userId,
    (Array.isArray(reservation?.lines) ? reservation.lines : []).map((line) => line.item_id)
  );
  const lineModels = buildReservationLineModels(reservation, vatRatesByItemId);
  const totals = buildTotals(lineModels);
  const emailPayload = buildEmailPayload({
    recipient,
    reservation,
    client,
    cartSummary,
    customerMessage,
    lineModels,
    totals,
  });

  return deliverEmail({
    to: recipient.email,
    subject: emailPayload.subject,
    text: emailPayload.text,
    html: emailPayload.html,
  });
};
