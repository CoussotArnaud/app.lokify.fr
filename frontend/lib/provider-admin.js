import { formatDate, formatDateTime } from "./date";

const providerStatusMeta = {
  archived: { label: "Archive", tone: "warning" },
  invited: { label: "Invite", tone: "info" },
  active: { label: "Actif", tone: "success" },
  blocked: { label: "Bloque", tone: "danger" },
};

const subscriptionStatusMeta = {
  inactive: { label: "Inactif", tone: "neutral" },
  active: { label: "Actif", tone: "success" },
  trial: { label: "Essai", tone: "info" },
  past_due: { label: "En retard", tone: "warning" },
  canceled: { label: "Annule", tone: "neutral" },
};

const saasLifecycleMeta = {
  inactive: { label: "Inactif", tone: "neutral" },
  active: { label: "Actif", tone: "success" },
  pending: { label: "En attente", tone: "info" },
};

const paymentStatusMeta = {
  paid: { label: "Paye", tone: "success" },
  pending: { label: "En attente", tone: "info" },
  unpaid: { label: "Impaye", tone: "danger" },
  overdue: { label: "En retard", tone: "warning" },
  canceled: { label: "Annule", tone: "neutral" },
  trial: { label: "Essai", tone: "info" },
  expired: { label: "Expire", tone: "neutral" },
  unknown: { label: "Inconnu", tone: "neutral" },
};

const stripeStatusMeta = {
  configured: { label: "Connecte", tone: "success" },
  not_configured: { label: "Non connecte", tone: "neutral" },
  pending: { label: "En attente", tone: "info" },
  restricted: { label: "Restreint", tone: "warning" },
};

const renewalStatusMeta = {
  active: { label: "Actif", tone: "success" },
  disabled: { label: "Desactive", tone: "neutral" },
};

const supportTicketStatusMeta = {
  open: { label: "Ouvert", tone: "warning" },
  in_progress: { label: "En cours", tone: "info" },
  closed: { label: "Ferme", tone: "success" },
};

const supportNotificationMeta = {
  support_ticket_created: { label: "Nouveau ticket", tone: "warning" },
  support_ticket_reply: { label: "Nouvelle reponse", tone: "info" },
};

const supportCategoryLabels = {
  general: "General",
  billing: "Abonnement",
  technical: "Technique",
  catalog: "Catalogue",
  training: "Accompagnement",
};

const getStatusMeta = (map, value, fallbackKey) => {
  const normalizedValue = String(value || fallbackKey).trim().toLowerCase();
  return map[normalizedValue] || map[fallbackKey];
};

export const getProviderStatusMeta = (status) =>
  getStatusMeta(providerStatusMeta, status, "active");

export const getSubscriptionStatusMeta = (status) =>
  getStatusMeta(subscriptionStatusMeta, status, "inactive");

export const getSaasLifecycleMeta = (status) =>
  getStatusMeta(saasLifecycleMeta, status, "inactive");

export const getPaymentStatusMeta = (status) =>
  getStatusMeta(paymentStatusMeta, status, "unknown");

export const getStripeStatusMeta = (status) =>
  getStatusMeta(stripeStatusMeta, status, "not_configured");

export const getRenewalStatusMeta = (cancelAtPeriodEnd) =>
  getStatusMeta(renewalStatusMeta, cancelAtPeriodEnd ? "disabled" : "active", "active");

export const getSupportTicketStatusMeta = (status) =>
  getStatusMeta(supportTicketStatusMeta, status, "open");

export const getSupportNotificationMeta = (notificationType) =>
  getStatusMeta(supportNotificationMeta, notificationType, "support_ticket_created");

export const getSupportCategoryLabel = (category) =>
  supportCategoryLabels[String(category || "general").trim().toLowerCase()] ||
  supportCategoryLabels.general;

export const formatAdminDate = (value, fallback = "Non renseigne") =>
  value ? formatDate(value) : fallback;

export const formatAdminDateTime = (value, fallback = "Non renseigne") =>
  value ? formatDateTime(value) : fallback;

export const formatBooleanLabel = (value) => (value ? "Oui" : "Non");

export const formatProviderAddress = (provider) =>
  [provider?.address, [provider?.postal_code, provider?.city].filter(Boolean).join(" "), provider?.country]
    .filter(Boolean)
    .join(", ") || "Non renseignee";
