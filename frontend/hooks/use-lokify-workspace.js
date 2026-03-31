"use client";

import { useEffect, useState } from "react";

import { useAuth } from "../components/auth-provider";
import { apiRequest } from "../lib/api";
import {
  buildReservationStatusMeta,
  defaultReservationStatuses,
  productStatusMeta,
  promotionExamples,
  reservationDepositStatusMeta,
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
  reportingOverview: {
    documents: [],
    invoices: [],
    cash: {
      entries: [],
      summary: {
        revenue_amount: 0,
        deposit_amount: 0,
        pending_revenue_count: 0,
        blocked_deposits_count: 0,
        deposits_to_release_count: 0,
        tracked_amount: 0,
      },
    },
  },
  clients: [],
  catalogCategories: [],
  catalogPacks: [],
  customStatuses: [],
  deliveryTours: [],
  items: [],
  itemProfiles: [],
  productUnits: [],
  reservations: [],
  stockMovements: [],
  taxRates: [],
};

const freeMailDomains = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "orange.fr"];
const professionalHints = ["event", "studio", "agence", "association", "entreprise", "production"];
const EMPTY_ARRAY = [];

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeNumber = (value) => Number(value || 0);
const ensureArray = (value, fallback = EMPTY_ARRAY) => (Array.isArray(value) ? value : fallback);
const buildQueryString = (params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
};

const summarizeReservationLines = (lines) => {
  if (!lines.length) {
    return {
      itemSummary: "Produit indisponible",
      category: "Catalogue",
      totalQuantity: 0,
      totalDeposit: 0,
      primaryItemName: "Produit indisponible",
    };
  }

  const totalQuantity = lines.reduce((sum, line) => sum + normalizeNumber(line.quantity), 0);
  const totalDeposit = lines.reduce(
    (sum, line) => sum + normalizeNumber(line.item_deposit) * normalizeNumber(line.quantity),
    0
  );
  const uniqueCategories = [...new Set(lines.map((line) => line.item_category).filter(Boolean))];
  const primaryLine = lines[0];
  const primaryQuantitySuffix = normalizeNumber(primaryLine.quantity) > 1 ? ` x${primaryLine.quantity}` : "";
  const itemSummary =
    lines.length === 1
      ? `${primaryLine.item_name}${primaryQuantitySuffix}`
      : `${primaryLine.item_name}${primaryQuantitySuffix} +${lines.length - 1} produit(s)`;

  return {
    itemSummary,
    category: uniqueCategories.length === 1 ? uniqueCategories[0] : "Multi-categories",
    totalQuantity,
    totalDeposit,
    primaryItemName: primaryLine.item_name,
  };
};

const isProfessionalClient = (client) => {
  const emailDomain = String(client.email || "").split("@")[1] || "";
  const haystack = [client.notes, client.last_name, client.first_name, emailDomain].join(" ").toLowerCase();

  if (professionalHints.some((hint) => haystack.includes(hint))) {
    return true;
  }

  return emailDomain ? !freeMailDomains.includes(emailDomain) : false;
};

const buildStatistics = ({
  reservations,
  products,
  clients,
  categories,
  deliveryTours,
  reservationStatusMetaMap,
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
    const statusTotal = statusMap.get(reservation.status) || 0;

    revenueByDayMap.set(dayKey, dayTotal + reservation.total_amount);
    statusMap.set(reservation.status, statusTotal + 1);

    reservation.lines.forEach((line) => {
      const productTotal = productUsageMap.get(line.item_name) || 0;
      productUsageMap.set(line.item_name, productTotal + normalizeNumber(line.quantity || 1));
    });
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
      label: reservationStatusMetaMap[status]?.label || status,
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
      const [
        clientsResponse,
        itemsResponse,
        reservationsResponse,
        overviewResponse,
        reportingOverviewResponse,
        catalogCategoriesResponse,
        catalogPacksResponse,
        itemProfilesResponse,
        taxRatesResponse,
        customStatusesResponse,
        deliveriesResponse,
        operationsResponse,
      ] = await Promise.all([
        apiRequest("/clients"),
        apiRequest("/items"),
        apiRequest("/reservations"),
        apiRequest("/dashboard/overview"),
        apiRequest("/reporting/overview").catch(() => ({
          documents: [],
          invoices: [],
          cash: {
            entries: [],
            summary: {
              revenue_amount: 0,
              deposit_amount: 0,
              pending_revenue_count: 0,
              blocked_deposits_count: 0,
              deposits_to_release_count: 0,
              tracked_amount: 0,
            },
          },
        })),
        apiRequest("/catalog/categories").catch(() => ({ categories: [] })),
        apiRequest("/catalog/packs").catch(() => ({ packs: [] })),
        apiRequest("/catalog/item-profiles").catch(() => ({ itemProfiles: [] })),
        apiRequest("/catalog/tax-rates").catch(() => ({ taxRates: [] })),
        apiRequest("/reservations/statuses").catch(() => ({ statuses: defaultReservationStatuses })),
        apiRequest("/deliveries").catch(() => ({ tours: [] })),
        apiRequest("/operations").catch(() => ({ productUnits: [], stockMovements: [] })),
      ]);

      setState((current) => ({
        ...current,
        loading: false,
        error: "",
        clients: ensureArray(clientsResponse.clients),
        catalogCategories: ensureArray(catalogCategoriesResponse.categories),
        catalogPacks: ensureArray(catalogPacksResponse.packs),
        customStatuses: ensureArray(customStatusesResponse.statuses, defaultReservationStatuses),
        deliveryTours: ensureArray(deliveriesResponse.tours),
        items: ensureArray(itemsResponse.items),
        itemProfiles: ensureArray(itemProfilesResponse.itemProfiles),
        productUnits: ensureArray(operationsResponse.productUnits),
        reportingOverview: reportingOverviewResponse || initialState.reportingOverview,
        reservations: ensureArray(reservationsResponse.reservations),
        stockMovements: ensureArray(operationsResponse.stockMovements),
        taxRates: ensureArray(taxRatesResponse.taxRates),
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
        reportingOverview: initialState.reportingOverview,
        clients: [],
        catalogCategories: [],
        catalogPacks: [],
        customStatuses: [],
        deliveryTours: [],
        items: [],
        itemProfiles: [],
        productUnits: [],
        reservations: [],
        stockMovements: [],
        taxRates: [],
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

  const itemProfilesByItemId = state.itemProfiles.reduce((accumulator, profile) => {
    accumulator[profile.item_id] = profile;
    return accumulator;
  }, {});
  const reservationStatuses =
    ensureArray(state.customStatuses).length > 0 ? ensureArray(state.customStatuses) : defaultReservationStatuses;
  const reservationStatusMetaMap = buildReservationStatusMeta(reservationStatuses);
  const productUnitRecords = state.productUnits.map((unit) => ({
    ...unit,
    active_reservation: unit.active_reservation || null,
  }));
  const productUnitsByItemId = productUnitRecords.reduce((accumulator, unit) => {
    const bucket = accumulator[unit.item_id] || [];
    bucket.push(unit);
    accumulator[unit.item_id] = bucket;
    return accumulator;
  }, {});

  const itemsById = state.items.reduce((accumulator, item) => {
    accumulator[item.id] = item;
    return accumulator;
  }, {});

  const reservationRecords = state.reservations
    .map((reservation) => {
      const client = clientRecords.find((entry) => entry.id === reservation.client_id);
      const startDate = new Date(reservation.start_date);
      const endDate = new Date(reservation.end_date);
      const durationDays = Math.max(1, differenceInCalendarDays(startDate, endDate));
      const lines =
        Array.isArray(reservation.lines) && reservation.lines.length
          ? reservation.lines
          : reservation.item_id
            ? [
                {
                  id: `${reservation.id}-legacy-line`,
                  item_id: reservation.item_id,
                  quantity: 1,
                  unit_price: reservation.price,
                  line_total: reservation.total_amount,
                },
              ]
            : [];
      const normalizedLines = lines.map((line, index) => {
        const item = itemsById[line.item_id];
        const itemProfile = item ? itemProfilesByItemId[item.id] : null;
        const assignedUnits = Array.isArray(line.assigned_units)
          ? line.assigned_units.map((assignment) => ({
              ...assignment,
              active: assignment.assignment_status === "departed",
            }))
          : [];

        return {
          ...line,
          id: line.id || `${reservation.id}-line-${index}`,
          item_id: line.item_id,
          item_name: line.item_name || item?.name || "Produit indisponible",
          item_category: line.item_category || itemProfile?.category_name || item?.category || "Catalogue",
          item_deposit: normalizeNumber(line.item_deposit ?? item?.deposit),
          quantity: normalizeNumber(line.quantity || 1),
          unit_price: normalizeNumber(line.unit_price ?? item?.price),
          line_total: normalizeNumber(line.line_total),
          assigned_units: assignedUnits,
        };
      });
      const summary = summarizeReservationLines(normalizedLines);

      return {
        ...reservation,
        reference: reservation.reference || `RSV-${reservation.id.slice(0, 8).toUpperCase()}`,
        source: reservation.source || "manual",
        fulfillment_mode: reservation.fulfillment_mode || "pickup",
        client_name: reservation.client_name || client?.full_name || "Client indisponible",
        client_email: client?.email || "",
        item_name: summary.itemSummary,
        item_summary: summary.itemSummary,
        primary_item_name: summary.primaryItemName,
        category: summary.category,
        total_amount: normalizeNumber(reservation.total_amount),
        deposit_tracking: {
          handling_mode: reservation.deposit_tracking?.handling_mode || "manual",
          calculated_amount: normalizeNumber(
            reservation.deposit_tracking?.calculated_amount ?? reservation.total_deposit ?? summary.totalDeposit
          ),
          manual_status:
            reservation.deposit_tracking?.manual_status ||
            (normalizeNumber(reservation.total_deposit ?? summary.totalDeposit) > 0 ? "pending" : "not_required"),
          manual_method: reservation.deposit_tracking?.manual_method || "",
          manual_reference: reservation.deposit_tracking?.manual_reference || "",
          notes: reservation.deposit_tracking?.notes || "",
          collected_at: reservation.deposit_tracking?.collected_at || null,
          released_at: reservation.deposit_tracking?.released_at || null,
        },
        deposit: normalizeNumber(
          reservation.deposit_tracking?.calculated_amount ?? reservation.total_deposit ?? summary.totalDeposit
        ),
        price: normalizeNumber(normalizedLines[0]?.unit_price),
        durationDays,
        line_count: normalizedLines.length,
        total_quantity: summary.totalQuantity,
        lines: normalizedLines,
        departure_tracking: reservation.departure_tracking
          ? {
              status: reservation.departure_tracking.status || "pending",
              processed_at: reservation.departure_tracking.processed_at || null,
              notes: reservation.departure_tracking.notes || "",
            }
          : null,
        return_tracking: reservation.return_tracking
          ? {
              status: reservation.return_tracking.status || "pending",
              processed_at: reservation.return_tracking.processed_at || null,
              notes: reservation.return_tracking.notes || "",
            }
          : null,
        isActive: ["draft", "confirmed", "pending"].includes(reservation.status),
      };
    })
    .sort((left, right) => new Date(left.start_date) - new Date(right.start_date));

  const productRecords = state.items.map((item) => {
    const profile = itemProfilesByItemId[item.id] || {};
    const trackedUnits = productUnitsByItemId[item.id] || [];
    const reservedUnits = reservationRecords.reduce((sum, reservation) => {
      if (!["draft", "confirmed", "pending"].includes(reservation.status)) {
        return sum;
      }

      if (new Date(reservation.end_date) < startOfDay(new Date())) {
        return sum;
      }

      return (
        sum +
        reservation.lines
          .filter((line) => line.item_id === item.id)
          .reduce((lineSum, line) => lineSum + normalizeNumber(line.quantity), 0)
      );
    }, 0);
    const normalizedStock = normalizeNumber(item.stock);
    const normalizedStatus = item.status || "available";
    const categoryName = profile.category_name || item.category || "";
    const categorySlug = profile.category_slug || slugify(categoryName);
    const isActive = profile.is_active ?? normalizedStatus !== "inactive";
    const unavailableUnits =
      normalizedStatus === "maintenance" || normalizedStatus === "unavailable" ? normalizedStock : 0;
    const trackedAvailableUnits = trackedUnits.filter((unit) => unit.status === "available").length;
    const checkedOutUnits = trackedUnits.filter((unit) => unit.status === "out").length;
    const trackedUnavailableUnits = trackedUnits.filter((unit) =>
      ["maintenance", "unavailable"].includes(unit.status)
    ).length;
    const unitCoverageGap = Boolean(profile.serial_tracking)
      ? Math.max(normalizedStock - trackedUnits.length, 0)
      : 0;
    const availableUnits = profile.serial_tracking
      ? trackedAvailableUnits
      : Math.max(normalizedStock - reservedUnits - unavailableUnits, 0);
    const operationalUnavailableUnits = profile.serial_tracking
      ? trackedUnavailableUnits
      : unavailableUnits;
    const effectiveAvailableUnits = isActive ? availableUnits : 0;
    const effectiveUnavailableUnits = isActive ? operationalUnavailableUnits : normalizedStock;

    return {
      ...item,
      stock: normalizedStock,
      price: normalizeNumber(item.price),
      deposit: normalizeNumber(item.deposit),
      profile,
      reservedUnits,
      unavailableUnits: effectiveUnavailableUnits,
      availableUnits: effectiveAvailableUnits,
      trackedUnits,
      trackedUnitsCount: trackedUnits.length,
      trackedAvailableUnits,
      checkedOutUnits,
      trackedUnavailableUnits,
      unitCoverageGap,
      category: categoryName,
      categorySlug,
      statusMeta: isActive
        ? productStatusMeta[normalizedStatus] || productStatusMeta.available
        : productStatusMeta.inactive,
      isActive,
      public_name: profile.public_name || item.name,
      public_description: profile.public_description || "",
      long_description: profile.long_description || "",
      thumbnail: profile.photos?.[0] || "",
      catalog_mode: profile.catalog_mode || "location",
      online_visible: Boolean(profile.online_visible),
      reservable: profile.reservable ?? true,
      vat: profile.vat ?? null,
      tax_rate_id: profile.tax_rate_id || "",
      price_custom: profile.price_custom || { label: "", amount: null },
      options: Array.isArray(profile.options) ? profile.options : [],
      variants: Array.isArray(profile.variants) ? profile.variants : [],
      sku: profile.sku || `REF-${item.id.slice(0, 6).toUpperCase()}`,
    };
  });

  const persistedCategoryRecords = state.catalogCategories.map((category) => ({
    ...category,
    slug: category.slug || slugify(category.name),
  }));

  const liveCategoryRecords = productRecords
    .filter((product) => product.categorySlug && product.category)
    .map((product) => ({
      id: product.categorySlug,
      name: product.category,
      slug: product.categorySlug,
      type: "Catalogue",
      description: "",
      filters: [],
      inspectionEnabled: false,
      durations: [],
      ranges: [],
      status: "active",
      source: "product",
    }));

  const categoryMap = new Map();
  [...persistedCategoryRecords, ...liveCategoryRecords].forEach((category) => {
    const slug = category.slug || category.id || slugify(category.name);

    if (!categoryMap.has(slug)) {
      categoryMap.set(slug, {
        ...category,
        slug,
      });
    }
  });
  const categories = Array.from(categoryMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "fr")
  );

  const packs = state.catalogPacks.map((pack) => {
    const linkedProducts = Array.isArray(pack.products)
      ? pack.products.map((packProduct) => {
          const product = productRecords.find((entry) => entry.id === packProduct.item_id);

          return product
            ? { ...product, sort_order: packProduct.sort_order }
            : {
                id: packProduct.item_id,
                name: packProduct.name,
                public_name: packProduct.public_name,
                category: packProduct.category_name,
                categorySlug: slugify(packProduct.category_name),
                price: normalizeNumber(packProduct.price),
                stock: normalizeNumber(packProduct.stock),
                status: packProduct.status,
                statusMeta: productStatusMeta[packProduct.status] || productStatusMeta.available,
                isActive: packProduct.status !== "inactive",
                thumbnail: packProduct.thumbnail || "",
                sort_order: packProduct.sort_order,
              };
        })
      : [];
    const totalPrice = linkedProducts.reduce(
      (sum, product) => sum + normalizeNumber(product.price),
      0
    );
    const discountedPrice =
      pack.discount_type === "amount"
        ? Math.max(totalPrice - normalizeNumber(pack.discount_value), 0)
        : pack.discount_type === "percentage"
          ? Math.max(totalPrice - totalPrice * (normalizeNumber(pack.discount_value) / 100), 0)
          : totalPrice;

    return {
      ...pack,
      linkedProducts,
      totalPrice,
      discountedPrice,
      activeProducts: linkedProducts.filter((product) => product.isActive).length,
    };
  });
  const taxRates = state.taxRates.map((taxRate) => ({
    ...taxRate,
    rate: normalizeNumber(taxRate.rate),
  }));
  const defaultTaxRate = taxRates.find((taxRate) => taxRate.is_default && taxRate.is_active) || null;

  const deliveries = state.deliveryTours
    .map((tour) => ({
      ...tour,
      date: tour.date || tour.scheduled_for,
      reservations: Array.isArray(tour.reservations) ? tour.reservations : [],
      stops: Array.isArray(tour.stops)
        ? [...tour.stops].sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
        : [],
    }))
    .sort((left, right) => new Date(left.date) - new Date(right.date));
  const departuresToProcess = reservationRecords
    .filter((reservation) => {
      if (reservation.status !== "confirmed") {
        return false;
      }

      if (reservation.departure_tracking?.status === "completed") {
        return false;
      }

      return new Date(reservation.start_date) <= addDays(new Date(), 3);
    })
    .sort((left, right) => new Date(left.start_date) - new Date(right.start_date));
  const returnsToProcess = reservationRecords
    .filter((reservation) => {
      if (reservation.status === "cancelled") {
        return false;
      }

      if (reservation.return_tracking?.status === "completed") {
        return false;
      }

      if (reservation.departure_tracking?.status !== "completed") {
        return false;
      }

      return new Date(reservation.end_date) <= addDays(new Date(), 3);
    })
    .sort((left, right) => new Date(left.end_date) - new Date(right.end_date));
  const stockJournal = state.stockMovements.map((movement) => ({
    ...movement,
    quantity: normalizeNumber(movement.quantity || 1),
    occurred_at: movement.occurred_at || movement.created_at,
    item_name: movement.item_name || itemsById[movement.item_id]?.name || "Produit indisponible",
    reservation_reference:
      movement.reservation_reference ||
      reservationRecords.find((reservation) => reservation.id === movement.reservation_id)?.reference ||
      "",
  }));

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
    reservationStatusMetaMap,
    totalRevenue,
  });

  const documentRows = reservationRecords.map((reservation) => ({
    id: reservation.id,
    client: reservation.client_name,
    reference: reservation.reference,
    quoteStatus: reservation.status === "draft" ? "A valider" : "Pret",
    contractStatus: reservation.status === "confirmed" ? "A signer" : "En preparation",
    inventoryStatus:
      reservation.return_tracking?.status === "completed"
        ? "Archive"
        : reservation.departure_tracking?.status === "completed"
          ? "En circulation"
          : "A planifier",
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
      status:
        reservationDepositStatusMeta[reservation.deposit_tracking.manual_status]?.label ||
        reservation.deposit_tracking.manual_status,
      tone:
        reservationDepositStatusMeta[reservation.deposit_tracking.manual_status]?.tone || "neutral",
    },
  ]);
  const reportingDocumentRows = Array.isArray(state.reportingOverview.documents)
    ? state.reportingOverview.documents
    : [];
  const reportingInvoiceRows = Array.isArray(state.reportingOverview.invoices)
    ? state.reportingOverview.invoices
    : [];
  const reportingCashEntries = Array.isArray(state.reportingOverview.cash?.entries)
    ? state.reportingOverview.cash.entries
    : [];
  const reportingCashSummary = state.reportingOverview.cash?.summary || {
    revenue_amount: 0,
    deposit_amount: 0,
    pending_revenue_count: 0,
    blocked_deposits_count: 0,
    deposits_to_release_count: 0,
    tracked_amount: 0,
  };

  return {
    ...state,
    reload: loadWorkspace,
    listClientsByScope: (scope = "active") =>
      apiRequest(`/clients${buildQueryString({ scope })}`),
    getClientDetail: (clientId) => apiRequest(`/clients/${clientId}`),
    saveClient: (payload, clientId = null) =>
      runMutation(() =>
        apiRequest(clientId ? `/clients/${clientId}` : "/clients", {
          method: clientId ? "PUT" : "POST",
          body: payload,
        })
      ),
    archiveClient: (clientId, payload = {}) =>
      runMutation(() =>
        apiRequest(`/clients/${clientId}/archive`, {
          method: "POST",
          body: payload,
        })
      ),
    restoreClient: (clientId, payload = {}) =>
      runMutation(() =>
        apiRequest(`/clients/${clientId}/restore`, {
          method: "POST",
          body: payload,
        })
      ),
    deleteClient: (clientId) =>
      runMutation(() =>
        apiRequest(`/clients/${clientId}/archive`, {
          method: "POST",
        })
      ),
    listReservations: (filters = {}) =>
      apiRequest(`/reservations${buildQueryString(filters)}`),
    saveReservation: (payload, reservationId = null) =>
      runMutation(() =>
        apiRequest(reservationId ? `/reservations/${reservationId}` : "/reservations", {
          method: reservationId ? "PUT" : "POST",
          body: payload,
        })
      ),
    getReservationDocument: (documentId) =>
      apiRequest(`/reporting/documents/${documentId}`),
    saveReservationDocument: (documentId, payload) =>
      runMutation(() =>
        apiRequest(`/reporting/documents/${documentId}`, {
          method: "PUT",
          body: payload,
        })
      ),
    deleteReservation: (reservationId) =>
      runMutation(() =>
        apiRequest(`/reservations/${reservationId}`, {
          method: "DELETE",
        })
      ),
    listClientDocuments: (clientId) =>
      apiRequest(`/clients/${clientId}/documents`),
    getClientDocument: (clientId, documentId) =>
      apiRequest(`/clients/${clientId}/documents/${documentId}`),
    uploadClientDocument: (clientId, payload) =>
      apiRequest(`/clients/${clientId}/documents`, {
        method: "POST",
        body: payload,
      }),
    deleteClientDocument: (clientId, documentId) =>
      apiRequest(`/clients/${clientId}/documents/${documentId}`, {
        method: "DELETE",
      }),
    saveItem: (payload, itemId = null) =>
      runMutation(() =>
        apiRequest(itemId ? `/items/${itemId}` : "/items", {
          method: itemId ? "PUT" : "POST",
          body: payload,
        })
      ),
    saveItemProfile: (itemId, payload) =>
      runMutation(() =>
        apiRequest(`/catalog/item-profiles/${itemId}`, {
          method: "PUT",
          body: payload,
        })
      ),
    saveCatalogProduct: (payload, itemId = null) =>
      runMutation(() =>
        apiRequest(itemId ? `/catalog/products/${itemId}` : "/catalog/products", {
          method: itemId ? "PUT" : "POST",
          body: payload,
        })
      ),
    uploadCatalogItemPhoto: (itemId, payload) =>
      apiRequest(`/catalog/item-profiles/${itemId}/photos`, {
        method: "POST",
        body: payload,
      }),
    saveCatalogCategory: (payload) =>
      runMutation(() =>
        apiRequest("/catalog/categories", {
          method: "POST",
          body: payload,
        })
      ),
    deleteCatalogCategory: (categorySlug) =>
      runMutation(() =>
        apiRequest(`/catalog/categories/${encodeURIComponent(categorySlug)}`, {
          method: "DELETE",
        })
      ),
    saveCatalogTaxRate: (payload, taxRateId = null) =>
      runMutation(() =>
        apiRequest(taxRateId ? `/catalog/tax-rates/${taxRateId}` : "/catalog/tax-rates", {
          method: taxRateId ? "PUT" : "POST",
          body: payload,
        })
      ),
    deleteCatalogTaxRate: (taxRateId) =>
      runMutation(() =>
        apiRequest(`/catalog/tax-rates/${taxRateId}`, {
          method: "DELETE",
        })
      ),
    saveCatalogPack: (payload, packId = null) =>
      runMutation(() =>
        apiRequest(packId ? `/catalog/packs/${packId}` : "/catalog/packs", {
          method: packId ? "PUT" : "POST",
          body: payload,
        })
      ),
    deleteCatalogPack: (packId) =>
      runMutation(() =>
        apiRequest(`/catalog/packs/${packId}`, {
          method: "DELETE",
        })
      ),
    duplicateCatalogPack: (packId) =>
      runMutation(() =>
        apiRequest(`/catalog/packs/${packId}/duplicate`, {
          method: "POST",
        })
      ),
    duplicateItem: (itemId) =>
      runMutation(() =>
        apiRequest(`/catalog/products/${itemId}/duplicate`, {
          method: "POST",
        })
      ),
    saveReservationStatuses: (statuses) =>
      runMutation(() =>
        apiRequest("/reservations/statuses", {
          method: "PUT",
          body: { statuses },
        })
      ),
    createProductUnit: (itemId, payload) =>
      runMutation(() =>
        apiRequest(`/operations/items/${itemId}/units`, {
          method: "POST",
          body: payload,
        })
      ),
    generateItemUnits: (itemId) =>
      runMutation(() =>
        apiRequest(`/operations/items/${itemId}/units/generate-missing`, {
          method: "POST",
        })
      ),
    updateProductUnit: (unitId, payload) =>
      runMutation(() =>
        apiRequest(`/operations/units/${unitId}`, {
          method: "PUT",
          body: payload,
        })
      ),
    markReservationDeparture: (reservationId, payload = {}) =>
      runMutation(() =>
        apiRequest(`/operations/reservations/${reservationId}/depart`, {
          method: "POST",
          body: payload,
        })
      ),
    markReservationReturn: (reservationId, payload = {}) =>
      runMutation(() =>
        apiRequest(`/operations/reservations/${reservationId}/return`, {
          method: "POST",
          body: payload,
        })
      ),
    createDeliveryTour: (payload) =>
      runMutation(() =>
        apiRequest("/deliveries", {
          method: "POST",
          body: payload,
        })
      ),
    updateDeliveryTour: (tourId, payload) =>
      runMutation(() =>
        apiRequest(`/deliveries/${tourId}`, {
          method: "PUT",
          body: payload,
        })
      ),
    deleteDeliveryTour: (tourId) =>
      runMutation(() =>
        apiRequest(`/deliveries/${tourId}`, {
          method: "DELETE",
        })
      ),
    moveDeliveryStop: (tourId, stopId, direction) =>
      runMutation(() =>
        apiRequest(`/deliveries/${tourId}/stops/${stopId}/move`, {
          method: "POST",
          body: { direction },
        })
      ),
    deleteItem: (itemId) =>
      runMutation(() =>
        apiRequest(`/items/${itemId}`, {
          method: "DELETE",
        })
      ),
    clients: clientRecords,
    catalogCategories: persistedCategoryRecords,
    catalogPacks: state.catalogPacks,
    customStatuses: reservationStatuses,
    itemProfiles: state.itemProfiles,
    itemProfilesByItemId,
    productUnits: productUnitRecords,
    productUnitsByItemId,
    products: productRecords,
    reservations: reservationRecords,
    reservationStatuses,
    reservationStatusMeta: reservationStatusMetaMap,
    categories,
    packs,
    taxRates,
    defaultTaxRate,
    deliveries,
    departuresToProcess,
    returnsToProcess,
    stockJournal,
    documents: reportingDocumentRows.length ? reportingDocumentRows : documentRows,
    invoiceDocuments: reportingInvoiceRows,
    cashEntries: reportingCashEntries.length ? reportingCashEntries : cashEntries,
    cashSummary: reportingCashSummary,
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
