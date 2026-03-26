"use client";

import { useEffect, useState } from "react";

import { useAuth } from "../components/auth-provider";
import { apiRequest } from "../lib/api";
import {
  categoryBlueprints,
  deliveryTemplates,
  packBlueprints,
  productStatusMeta,
  promotionExamples,
  reservationStatusMeta,
  salesChannelExamples,
  toolboxModules,
} from "../lib/lokify-data";
import { addDays, differenceInCalendarDays, formatDate, startOfDay } from "../lib/date";

const initialOverview = {
  stats: {
    total_reservations: 0,
    total_revenue: 0,
    used_items: 0,
    draft_reservations: 0,
    total_stock: 0,
  },
  recent_reservations: [],
  upcoming_reservations: [],
};

const initialState = {
  loading: true,
  mutating: false,
  error: "",
  overview: initialOverview,
  clients: [],
  items: [],
  reservations: [],
};

const freeMailDomains = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "orange.fr"];
const professionalHints = ["event", "studio", "agence", "association", "entreprise", "production"];

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeNumber = (value) => Number(value || 0);

const isProfessionalClient = (client) => {
  const emailDomain = String(client.email || "").split("@")[1] || "";
  const haystack = [client.notes, client.last_name, client.first_name, emailDomain].join(" ").toLowerCase();

  if (professionalHints.some((hint) => haystack.includes(hint))) {
    return true;
  }

  return emailDomain ? !freeMailDomains.includes(emailDomain) : false;
};

const buildDeliveryTours = (reservations, clients) =>
  deliveryTemplates.map((template, index) => {
    const tourDate = addDays(new Date(), template.dayOffset);
    const relatedReservations = reservations
      .filter((reservation) =>
        reservation.status !== "cancelled" && differenceInCalendarDays(new Date(), reservation.start_date) <= 14
      )
      .slice(index, index + 2);

    const fallbackClient = clients[index % Math.max(clients.length, 1)];
    const address = fallbackClient?.address || `${12 + index} avenue de la Logistique, France`;

    return {
      id: template.id,
      name: template.name,
      driver: template.driver,
      area: template.area,
      status: template.status,
      date: tourDate.toISOString(),
      address,
      reservations: relatedReservations,
      stops: template.stops.map((stop, stopIndex) => ({
        ...stop,
        id: `${template.id}-${stopIndex}`,
        address:
          stop.kind === "depot"
            ? "Depot LOKIFY"
            : relatedReservations[stopIndex - 1]?.client_name || fallbackClient?.full_name || "Client a confirmer",
      })),
    };
  });

const buildStatistics = ({
  reservations,
  products,
  clients,
  categories,
  deliveryTours,
  totalRevenue,
}) => {
  const revenueByDayMap = new Map();
  const productUsageMap = new Map();
  const statusMap = new Map();

  reservations.forEach((reservation) => {
    const dayKey = formatDate(reservation.start_date, {
      day: "2-digit",
      month: "short",
    });
    const dayTotal = revenueByDayMap.get(dayKey) || 0;
    const productTotal = productUsageMap.get(reservation.item_name) || 0;
    const statusTotal = statusMap.get(reservation.status) || 0;

    revenueByDayMap.set(dayKey, dayTotal + reservation.total_amount);
    productUsageMap.set(reservation.item_name, productTotal + 1);
    statusMap.set(reservation.status, statusTotal + 1);
  });

  const revenueByDay = Array.from(revenueByDayMap.entries()).map(([label, value]) => ({
    label,
    value,
  }));
  const maxRevenue = revenueByDay.reduce((max, entry) => Math.max(max, entry.value), 0) || 1;

  const channelRows = salesChannelExamples.map((channel) => ({
    ...channel,
    amount: Math.round((totalRevenue || 2100) * (channel.share / 100)),
  }));

  const categoryRows = categories.map((category) => {
    const relatedProducts = products.filter((product) => product.categorySlug === category.slug);
    const relatedReservations = reservations.filter(
      (reservation) => slugify(reservation.category) === category.slug
    );

    return {
      id: category.slug,
      label: category.name,
      products: relatedProducts.length,
      reservations: relatedReservations.length,
      revenue: relatedReservations.reduce((sum, reservation) => sum + reservation.total_amount, 0),
    };
  });

  const bestsellerRows = Array.from(productUsageMap.entries())
    .map(([label, volume]) => ({
      label,
      volume,
    }))
    .sort((left, right) => right.volume - left.volume)
    .slice(0, 5);

  const clientRows = [
    {
      label: "Professionnels",
      value: clients.filter((client) => client.segment === "Professionnel").length,
    },
    {
      label: "Particuliers",
      value: clients.filter((client) => client.segment === "Particulier").length,
    },
    {
      label: "Clients actifs",
      value: clients.filter((client) => client.reservationCount > 0).length,
    },
  ];

  const onlineRows = [
    {
      label: "Demandes web",
      value: Math.max(4, reservations.length * 2),
    },
    {
      label: "Taux de conversion",
      value: Math.max(22, Math.round((reservations.length / Math.max(clients.length, 1)) * 100)),
    },
    {
      label: "Panier moyen",
      value: Math.round(totalRevenue / Math.max(reservations.length, 1)),
    },
  ];

  const promotionRows = promotionExamples.map((promotion) => ({
    ...promotion,
    revenue: promotion.revenue + Math.round(totalRevenue * 0.08),
  }));

  return {
    revenueByDay,
    maxRevenue,
    channelRows,
    categoryRows,
    reservationStatusRows: Array.from(statusMap.entries()).map(([status, volume]) => ({
      id: status,
      label: reservationStatusMeta[status]?.label || status,
      volume,
    })),
    deliveryRows: deliveryTours.map((tour) => ({
      id: tour.id,
      label: tour.name,
      volume: tour.reservations.length,
    })),
    bestsellerRows,
    clientRows,
    onlineRows,
    promotionRows,
  };
};

export default function useLokifyWorkspace() {
  const { ready, isAuthenticated, user } = useAuth();
  const [state, setState] = useState(initialState);

  const loadWorkspace = async () => {
    setState((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    try {
      const [clientsResponse, itemsResponse, reservationsResponse, overviewResponse] =
        await Promise.all([
          apiRequest("/clients"),
          apiRequest("/items"),
          apiRequest("/reservations"),
          apiRequest("/dashboard/overview"),
        ]);

      setState((current) => ({
        ...current,
        loading: false,
        error: "",
        clients: clientsResponse.clients || [],
        items: itemsResponse.items || [],
        reservations: reservationsResponse.reservations || [],
        overview: overviewResponse || initialOverview,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error.message,
      }));
    }
  };

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!isAuthenticated || !user?.permissions?.canAccessOperationalModules) {
      setState((current) => ({
        ...current,
        loading: false,
        error: "",
        overview: initialOverview,
        clients: [],
        items: [],
        reservations: [],
      }));
      return;
    }

    loadWorkspace();
  }, [ready, isAuthenticated, user]);

  const runMutation = async (callback) => {
    setState((current) => ({
      ...current,
      mutating: true,
      error: "",
    }));

    try {
      const result = await callback();
      await loadWorkspace();
      return result;
    } finally {
      setState((current) => ({
        ...current,
        mutating: false,
      }));
    }
  };

  const clientRecords = state.clients.map((client) => {
    const reservationCount = state.reservations.filter((reservation) => reservation.client_id === client.id).length;

    return {
      ...client,
      full_name: `${client.first_name} ${client.last_name}`,
      segment: isProfessionalClient(client) ? "Professionnel" : "Particulier",
      reservationCount,
    };
  });

  const reservationRecords = state.reservations
    .map((reservation) => {
      const item = state.items.find((entry) => entry.id === reservation.item_id);
      const client = clientRecords.find((entry) => entry.id === reservation.client_id);
      const startDate = new Date(reservation.start_date);
      const endDate = new Date(reservation.end_date);
      const durationDays = Math.max(1, differenceInCalendarDays(startDate, endDate));

      return {
        ...reservation,
        client_name: reservation.client_name || client?.full_name || "Client indisponible",
        client_email: client?.email || "",
        item_name: reservation.item_name || item?.name || "Produit indisponible",
        category: item?.category || "Catalogue",
        total_amount: normalizeNumber(reservation.total_amount),
        deposit: normalizeNumber(item?.deposit),
        price: normalizeNumber(item?.price),
        durationDays,
        isActive: ["draft", "confirmed"].includes(reservation.status),
      };
    })
    .sort((left, right) => new Date(left.start_date) - new Date(right.start_date));

  const productRecords = state.items.map((item) => {
    const reservedUnits = reservationRecords.filter(
      (reservation) =>
        reservation.item_id === item.id &&
        ["draft", "confirmed"].includes(reservation.status) &&
        new Date(reservation.end_date) >= startOfDay(new Date())
    ).length;
    const normalizedStock = normalizeNumber(item.stock);
    const normalizedStatus = item.status || "available";
    const unavailableUnits =
      normalizedStatus === "maintenance" || normalizedStatus === "unavailable" ? normalizedStock : 0;
    const availableUnits = Math.max(normalizedStock - reservedUnits - unavailableUnits, 0);

    return {
      ...item,
      stock: normalizedStock,
      price: normalizeNumber(item.price),
      deposit: normalizeNumber(item.deposit),
      reservedUnits,
      unavailableUnits,
      availableUnits,
      categorySlug: slugify(item.category),
      statusMeta: productStatusMeta[normalizedStatus] || productStatusMeta.available,
      isActive: normalizedStatus !== "inactive",
    };
  });

  const liveCategoryRecords = productRecords.map((product) => ({
    id: product.categorySlug,
    name: product.category,
    slug: product.categorySlug,
    type: "Catalogue",
    description: `Categorie issue du parc LOKIFY pour ${product.category}.`,
    filters: ["format", "stock"],
    inspectionEnabled: true,
    durations: [],
    ranges: [],
    status: "active",
  }));

  const categoryMap = new Map();
  [...categoryBlueprints, ...liveCategoryRecords].forEach((category) => {
    const slug = category.slug || category.id || slugify(category.name);

    if (!categoryMap.has(slug)) {
      categoryMap.set(slug, {
        ...category,
        slug,
      });
    }
  });
  const categories = Array.from(categoryMap.values());

  const packs = packBlueprints.map((pack) => {
    const linkedProducts = productRecords.filter(
      (product) =>
        product.categorySlug === pack.categoryId || pack.productHints.includes(product.name)
    );

    return {
      ...pack,
      linkedProducts,
      activeProducts: linkedProducts.filter((product) => product.isActive).length,
    };
  });

  const deliveries = buildDeliveryTours(reservationRecords, clientRecords);

  const totalRevenue = reservationRecords
    .filter((reservation) => ["confirmed", "completed"].includes(reservation.status))
    .reduce((sum, reservation) => sum + reservation.total_amount, 0);
  const totalStock = productRecords.reduce((sum, product) => sum + product.stock, 0);
  const rentedUnits = productRecords.reduce((sum, product) => sum + product.reservedUnits, 0);
  const unavailableUnits = productRecords.reduce((sum, product) => sum + product.unavailableUnits, 0);
  const availableUnits = productRecords.reduce((sum, product) => sum + product.availableUnits, 0);

  const statistics = buildStatistics({
    reservations: reservationRecords,
    products: productRecords,
    clients: clientRecords,
    categories,
    deliveryTours: deliveries,
    totalRevenue,
  });

  const documentRows = reservationRecords.map((reservation) => ({
    id: reservation.id,
    client: reservation.client_name,
    reference: `RSV-${reservation.id.slice(0, 6).toUpperCase()}`,
    quoteStatus: reservation.status === "draft" ? "A valider" : "Pret",
    contractStatus: reservation.status === "confirmed" ? "A signer" : "En preparation",
    inventoryStatus: reservation.status === "completed" ? "Archive" : "A planifier",
  }));

  const cashEntries = reservationRecords.flatMap((reservation) => [
    {
      id: `${reservation.id}-loc`,
      type: "Location",
      label: reservation.item_name,
      date: reservation.start_date,
      amount: reservation.total_amount,
      status: reservation.status === "cancelled" ? "Annule" : "A encaisser",
    },
    {
      id: `${reservation.id}-deposit`,
      type: "Depot",
      label: reservation.client_name,
      date: reservation.start_date,
      amount: reservation.deposit,
      status: reservation.status === "completed" ? "A restituer" : "Bloque",
    },
  ]);

  return {
    ...state,
    reload: loadWorkspace,
    saveClient: (payload, clientId = null) =>
      runMutation(() =>
        apiRequest(clientId ? `/clients/${clientId}` : "/clients", {
          method: clientId ? "PUT" : "POST",
          body: payload,
        })
      ),
    deleteClient: (clientId) =>
      runMutation(() =>
        apiRequest(`/clients/${clientId}`, {
          method: "DELETE",
        })
      ),
    saveReservation: (payload, reservationId = null) =>
      runMutation(() =>
        apiRequest(reservationId ? `/reservations/${reservationId}` : "/reservations", {
          method: reservationId ? "PUT" : "POST",
          body: payload,
        })
      ),
    deleteReservation: (reservationId) =>
      runMutation(() =>
        apiRequest(`/reservations/${reservationId}`, {
          method: "DELETE",
        })
      ),
    saveItem: (payload, itemId = null) =>
      runMutation(() =>
        apiRequest(itemId ? `/items/${itemId}` : "/items", {
          method: itemId ? "PUT" : "POST",
          body: payload,
        })
      ),
    deleteItem: (itemId) =>
      runMutation(() =>
        apiRequest(`/items/${itemId}`, {
          method: "DELETE",
        })
      ),
    clients: clientRecords,
    products: productRecords,
    reservations: reservationRecords,
    categories,
    packs,
    deliveries,
    documents: documentRows,
    cashEntries,
    toolboxModules: toolboxModules.map((module) => ({
      ...module,
      enabled: module.enabledByDefault,
    })),
    metrics: {
      totalRevenue,
      totalStock,
      rentedUnits,
      unavailableUnits,
      availableUnits,
      profitability: Math.round(totalRevenue * 0.37),
      parkUsageRate: totalStock ? Math.round((rentedUnits / totalStock) * 100) : 0,
    },
    statistics,
    subscriptionRestricted: Boolean(user && !user.permissions?.canAccessOperationalModules),
  };
}
