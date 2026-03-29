"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";

import { useAuth } from "../../components/auth-provider";
import AppShell from "../../components/app-shell";
import DataTable from "../../components/data-table";
import Icon from "../../components/icon";
import MetricCard from "../../components/metric-card";
import Panel from "../../components/panel";
import SearchInput from "../../components/search-input";
import SegmentedTabs from "../../components/segmented-tabs";
import StatusPill from "../../components/status-pill";
import SuperAdminDashboard from "../../components/super-admin-dashboard";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import { isSuperAdmin } from "../../lib/access";
import {
  deliveryAssignmentMeta,
  deliveryTourStatusMeta,
  dashboardDisplayModes,
  dashboardHorizonModes,
  dashboardTabs,
  stockMovementMeta,
} from "../../lib/lokify-data";
import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMonthLabel,
  getDaysInMonth,
  getDaysInRange,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDateInputValue,
} from "../../lib/date";

const stockDisplayModes = [
  { id: "table", label: "Tableau" },
  { id: "grid", label: "Grille" },
];

const getTimeWindow = (mode, referenceDate) => {
  if (mode === "day") {
    return { start: startOfDay(referenceDate), end: endOfDay(referenceDate) };
  }

  if (mode === "month") {
    return { start: startOfMonth(referenceDate), end: endOfMonth(referenceDate) };
  }

  return { start: startOfWeek(referenceDate), end: endOfWeek(referenceDate) };
};

const shiftReferenceDate = (referenceDate, mode, direction) => {
  if (mode === "day") {
    return addDays(referenceDate, direction);
  }

  if (mode === "month") {
    return addMonths(referenceDate, direction);
  }

  return addDays(referenceDate, direction * 7);
};

const buildPeriodLabel = (mode, referenceDate) => {
  if (mode === "day") {
    return formatDate(referenceDate, { weekday: "long", day: "numeric", month: "long" });
  }

  if (mode === "month") {
    return formatMonthLabel(referenceDate);
  }

  const weekStart = startOfWeek(referenceDate);
  const weekEnd = endOfWeek(referenceDate);

  return `${formatDate(weekStart, { day: "numeric", month: "short" })} - ${formatDate(weekEnd, { day: "numeric", month: "short" })}`;
};

const formatPlanningWeekday = (value, horizonMode) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: horizonMode === "month" ? "short" : "long",
  }).format(new Date(value));

const formatPlanningDayLabel = (value, horizonMode) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: horizonMode === "month" ? "short" : "long",
    year: "numeric",
  }).format(new Date(value));

const formatMissionLabel = (count) => `${count} mission${count > 1 ? "s" : ""}`;
const buildDeliveryCandidateKey = (reservationId, assignmentType) =>
  `${reservationId}:${assignmentType}`;
const buildEmptyTourForm = (dateValue = toDateInputValue(new Date())) => ({
  name: "",
  driver: "",
  area: "",
  date: dateValue,
  assignment_keys: [],
});
const dashboardHeroStorageKey = "lokify-dashboard-hero-hidden";

const openReservationEditor = (reservationId) => {
  if (typeof window === "undefined" || !reservationId) {
    return;
  }

  window.location.assign(`/reservations?edit=${encodeURIComponent(reservationId)}`);
};

const renderCalendarBoard = ({
  reservations,
  referenceDate,
  horizonMode,
  reservationStatusMeta,
  onOpenReservation,
}) => {
  const days =
    horizonMode === "month"
      ? getDaysInMonth(referenceDate)
      : horizonMode === "week"
        ? getDaysInRange(startOfWeek(referenceDate), 7)
        : [startOfDay(referenceDate)];

  return (
    <div className={`calendar-board ${horizonMode}`}>
      {days.map((day) => {
        const dayReservations = reservations.filter((reservation) => {
          const startDate = new Date(reservation.start_date);
          const endDate = new Date(reservation.end_date);
          return startDate <= endOfDay(day) && endDate >= startOfDay(day);
        });
        const visibleReservations = horizonMode === "day" ? dayReservations : dayReservations.slice(0, 4);

        return (
          <article key={day.toISOString()} className="calendar-day-card">
            <header className="planning-day-header">
              <div className="planning-day-title">
                <span className="planning-day-weekday">{formatPlanningWeekday(day, horizonMode)}</span>
                <strong>{formatPlanningDayLabel(day, horizonMode)}</strong>
              </div>
              <span className={`planning-day-count ${dayReservations.length ? "busy" : "empty"}`}>
                {formatMissionLabel(dayReservations.length)}
              </span>
            </header>
            {dayReservations.length ? (
              <>
                {visibleReservations.map((reservation) => (
                  <button
                    key={reservation.id}
                    type="button"
                    className="calendar-event planning-event-card planning-event-card-button"
                    onClick={() => onOpenReservation(reservation.id)}
                  >
                    <div className="planning-event-copy">
                      <strong>{reservation.client_name}</strong>
                      <small>{reservation.item_name}</small>
                    </div>
                    <div className="planning-event-footer">
                      <small>{formatDateTime(reservation.start_date)}</small>
                      <StatusPill
                        tone={reservationStatusMeta[reservation.status]?.tone || "neutral"}
                        color={reservationStatusMeta[reservation.status]?.color}
                      >
                        {reservationStatusMeta[reservation.status]?.label || reservation.status}
                      </StatusPill>
                    </div>
                  </button>
                ))}
                {dayReservations.length > visibleReservations.length ? (
                  <span className="planning-day-more">
                    +{dayReservations.length - visibleReservations.length} autre(s)
                  </span>
                ) : null}
              </>
            ) : (
              <div className="empty-state planning-empty-state">
                <strong>Aucune reservation</strong>
                <span>Cette plage reste disponible pour une nouvelle operation.</span>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};

function ProviderDashboardPage() {
  const workspace = useLokifyWorkspace();
  const reservationStatusMeta = workspace.reservationStatusMeta;
  const reservationStatusOptions = workspace.reservationStatuses;
  const [activeTab, setActiveTab] = useState("reservations");
  const [heroHidden, setHeroHidden] = useState(false);
  const [dashboardFocus, setDashboardFocus] = useState("");
  const [displayMode, setDisplayMode] = useState("calendar");
  const [horizonMode, setHorizonMode] = useState("week");
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stockSearch, setStockSearch] = useState("");
  const [stockDisplay, setStockDisplay] = useState("table");
  const [deliveryDate, setDeliveryDate] = useState(toDateInputValue(new Date()));
  const [selectedDeliveryId, setSelectedDeliveryId] = useState("");
  const [deliveryEditorId, setDeliveryEditorId] = useState("");
  const [deliveryFeedback, setDeliveryFeedback] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  const [tourForm, setTourForm] = useState(() => buildEmptyTourForm());
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const deferredStockSearch = useDeferredValue(stockSearch.trim().toLowerCase());
  const planningPanelRef = useRef(null);
  const departuresPanelRef = useRef(null);
  const returnsPanelRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    const requestedFocus = params.get("focus");

    if (dashboardTabs.some((tab) => tab.id === requestedTab)) {
      setActiveTab(requestedTab);
    }

    if (["planning", "departures", "returns"].includes(requestedFocus)) {
      setDashboardFocus(requestedFocus);
    }

    const storedHeroPreference = window.localStorage.getItem(dashboardHeroStorageKey);
    if (storedHeroPreference === "true") {
      setHeroHidden(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(dashboardHeroStorageKey, heroHidden ? "true" : "false");
  }, [heroHidden]);

  const timeWindow = getTimeWindow(horizonMode, referenceDate);
  const filteredReservations = workspace.reservations.filter((reservation) => {
    const startDate = new Date(reservation.start_date);

    if (startDate < timeWindow.start || startDate > timeWindow.end) {
      return false;
    }
    if (clientFilter !== "all" && reservation.client_id !== clientFilter) {
      return false;
    }
    if (
      productFilter !== "all" &&
      !reservation.lines.some((line) => line.item_id === productFilter)
    ) {
      return false;
    }
    if (statusFilter !== "all" && reservation.status !== statusFilter) {
      return false;
    }
    if (!deferredSearch) {
      return true;
    }

    return [reservation.client_name, reservation.item_name, reservation.category]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch);
  });

  const upcomingDepartures = workspace.departuresToProcess;
  const upcomingReturns = workspace.returnsToProcess;
  const dayAgenda = filteredReservations.filter(
    (reservation) => isSameDay(reservation.start_date, referenceDate) || isSameDay(reservation.end_date, referenceDate)
  );

  const deliveryRows = workspace.deliveries;
  const deliveriesForDate = deliveryRows.filter((tour) => toDateInputValue(tour.date) === deliveryDate);
  const visibleDeliveryRows = deliveriesForDate.length ? deliveriesForDate : deliveryRows;
  const deliveryAssignments = deliveryRows.flatMap((tour) =>
    tour.reservations.map((assignment) => ({
      ...assignment,
      key: buildDeliveryCandidateKey(assignment.reservation_id, assignment.assignment_type),
      tour_id: tour.id,
    }))
  );
  const assignedTourByKey = deliveryAssignments.reduce((accumulator, assignment) => {
    if (!accumulator.has(assignment.key)) {
      accumulator.set(assignment.key, assignment.tour_id);
    }
    return accumulator;
  }, new Map());
  const deliveryCandidates = [
    ...workspace.reservations
      .filter(
        (reservation) =>
          ["confirmed", "pending"].includes(reservation.status) &&
          reservation.departure_tracking?.status !== "completed" &&
          toDateInputValue(reservation.start_date) === tourForm.date
      )
      .map((reservation) => ({
        key: buildDeliveryCandidateKey(reservation.id, "delivery"),
        reservation_id: reservation.id,
        assignment_type: "delivery",
        client_name: reservation.client_name,
        item_name: reservation.item_name,
        date_label: formatDateTime(reservation.start_date),
        reference: reservation.reference,
      })),
    ...workspace.reservations
      .filter(
        (reservation) =>
          reservation.status !== "cancelled" &&
          reservation.return_tracking?.status !== "completed" &&
          toDateInputValue(reservation.end_date) === tourForm.date
      )
      .map((reservation) => ({
        key: buildDeliveryCandidateKey(reservation.id, "return"),
        reservation_id: reservation.id,
        assignment_type: "return",
        client_name: reservation.client_name,
        item_name: reservation.item_name,
        date_label: formatDateTime(reservation.end_date),
        reference: reservation.reference,
      })),
  ]
    .filter((candidate) => {
      const assignedTourId = assignedTourByKey.get(candidate.key);
      return !assignedTourId || assignedTourId === deliveryEditorId;
    })
    .sort((left, right) => left.date_label.localeCompare(right.date_label));

  useEffect(() => {
    const availableKeys = new Set(deliveryCandidates.map((candidate) => candidate.key));
    setTourForm((current) => {
      const nextKeys = current.assignment_keys.filter((key) => availableKeys.has(key));

      if (
        nextKeys.length === current.assignment_keys.length &&
        nextKeys.every((key, index) => key === current.assignment_keys[index])
      ) {
        return current;
      }

      return {
        ...current,
        assignment_keys: nextKeys,
      };
    });
  }, [deliveryCandidates]);

  useEffect(() => {
    if (!visibleDeliveryRows.length) {
      setSelectedDeliveryId("");
      return;
    }

    if (!visibleDeliveryRows.some((tour) => tour.id === selectedDeliveryId)) {
      setSelectedDeliveryId(visibleDeliveryRows[0].id);
    }
  }, [selectedDeliveryId, visibleDeliveryRows]);

  const selectedDelivery =
    visibleDeliveryRows.find((tour) => tour.id === selectedDeliveryId) || visibleDeliveryRows[0] || null;
  const isEditingDelivery = Boolean(deliveryEditorId);

  const stockRows = workspace.categories.map((category) => {
    const categoryProducts = workspace.products.filter((product) => product.categorySlug === category.slug);
    return {
      id: category.slug,
      label: category.name,
      products: categoryProducts.length,
      available: categoryProducts.reduce((sum, product) => sum + product.availableUnits, 0),
      reserved: categoryProducts.reduce((sum, product) => sum + product.reservedUnits, 0),
      unavailable: categoryProducts.reduce((sum, product) => sum + product.unavailableUnits, 0),
    };
  });

  const filteredProducts = workspace.products.filter((product) =>
    [product.name, product.category].join(" ").toLowerCase().includes(deferredStockSearch || "")
  );
  const recentStockMovements = workspace.stockJournal.slice(0, 12);

  const resetTourComposer = () => {
    setDeliveryEditorId("");
    setTourForm(buildEmptyTourForm());
  };

  const startEditingTour = (tour) => {
    setDeliveryEditorId(tour.id);
    setSelectedDeliveryId(tour.id);
    setDeliveryDate(toDateInputValue(tour.date));
    setTourForm({
      name: tour.name || "",
      driver: tour.driver || "",
      area: tour.area || "",
      date: toDateInputValue(tour.date),
      assignment_keys: tour.reservations.map((assignment) =>
        buildDeliveryCandidateKey(assignment.reservation_id, assignment.assignment_type)
      ),
    });
    setDeliveryError("");
    setDeliveryFeedback("");
  };

  const toggleTourAssignment = (assignmentKey) => {
    setTourForm((current) => ({
      ...current,
      assignment_keys: current.assignment_keys.includes(assignmentKey)
        ? current.assignment_keys.filter((entry) => entry !== assignmentKey)
        : [...current.assignment_keys, assignmentKey],
    }));
  };

  const saveTour = async (event) => {
    event.preventDefault();
    setDeliveryError("");
    setDeliveryFeedback("");

    if (!tourForm.name || !tourForm.area || !tourForm.date) {
      setDeliveryError("Nom, zone et date sont obligatoires pour creer une tournee.");
      return;
    }

    try {
      const assignments = deliveryCandidates
        .filter((candidate) => tourForm.assignment_keys.includes(candidate.key))
        .map((candidate) => ({
          reservation_id: candidate.reservation_id,
          assignment_type: candidate.assignment_type,
        }));

      const payload = {
        name: tourForm.name,
        driver: tourForm.driver,
        area: tourForm.area,
        date: new Date(tourForm.date).toISOString(),
        assignments,
      };
      const response = deliveryEditorId
        ? await workspace.updateDeliveryTour(deliveryEditorId, payload)
        : await workspace.createDeliveryTour(payload);

      setDeliveryDate(tourForm.date);
      setSelectedDeliveryId(response?.tour?.id || "");
      resetTourComposer();
      setDeliveryFeedback(deliveryEditorId ? "Tournee mise a jour." : "Tournee enregistree.");
    } catch (creationError) {
      setDeliveryError(creationError.message);
    }
  };

  const removeTour = async (tourId) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Supprimer cette tournee ?");
      if (!confirmed) {
        return;
      }
    }

    setDeliveryError("");
    setDeliveryFeedback("");

    try {
      await workspace.deleteDeliveryTour(tourId);
      if (selectedDeliveryId === tourId) {
        setSelectedDeliveryId("");
      }
      if (deliveryEditorId === tourId) {
        resetTourComposer();
      }
      setDeliveryFeedback("Tournee supprimee.");
    } catch (deleteError) {
      setDeliveryError(deleteError.message);
    }
  };

  const moveSelectedStop = async (stopId, direction) => {
    if (!selectedDelivery) {
      return;
    }

    setDeliveryError("");
    setDeliveryFeedback("");

    try {
      await workspace.moveDeliveryStop(selectedDelivery.id, stopId, direction);
      setSelectedDeliveryId(selectedDelivery.id);
      setDeliveryFeedback("Ordre de tournee mis a jour.");
    } catch (moveError) {
      setDeliveryError(moveError.message);
    }
  };

  const handleDashboardShortcut = (shortcut) => {
    setActiveTab("reservations");
    setClientFilter("all");
    setProductFilter("all");
    setSearch("");

    if (shortcut === "drafts") {
      setDisplayMode("list");
      setHorizonMode("month");
      setReferenceDate(new Date());
      setStatusFilter("draft");
      setDashboardFocus("planning");
      return;
    }

    setReferenceDate(new Date());
    setStatusFilter("all");
    setDashboardFocus(shortcut);
  };

  useEffect(() => {
    if (activeTab !== "reservations" || !dashboardFocus || typeof window === "undefined") {
      return;
    }

    const target =
      dashboardFocus === "departures"
        ? departuresPanelRef.current
        : dashboardFocus === "returns"
          ? returnsPanelRef.current
          : planningPanelRef.current;

    if (!target) {
      return;
    }

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    setDashboardFocus("");
  }, [activeTab, dashboardFocus]);

  return (
    <AppShell>
      <div className="page-stack">
        {heroHidden ? (
          <section className="hero-banner-collapsed">
            <div>
              <strong>Bloc dashboard masque</strong>
              <p className="muted-text">Reaffichez-le quand vous avez besoin du resume general.</p>
            </div>
            <button type="button" className="button subtle hero-banner-toggle" onClick={() => setHeroHidden(false)}>
              Afficher
            </button>
          </section>
        ) : (
          <section className="hero-banner">
            <div className="hero-banner-header">
              <div className="page-heading">
                <p className="eyebrow">Dashboard</p>
                <h1>Pilotez vos reservations, vos livraisons et vos mouvements de stock.</h1>
                <p>Retrouvez les priorites du jour, le planning et les indicateurs utiles au meme endroit.</p>
              </div>
              <button type="button" className="button subtle hero-banner-toggle" onClick={() => setHeroHidden(true)}>
                Masquer
              </button>
            </div>
            <div className="hero-banner-card">
              <div className="hero-banner-kpi">
                <span className="hero-banner-kpi-label">Parc mobilise</span>
                <strong className="hero-banner-kpi-value">{workspace.metrics.parkUsageRate}%</strong>
                <p className="hero-banner-meta">
                  {workspace.metrics.rentedUnits} unite(s) engagee(s) sur {workspace.metrics.totalStock} en stock
                </p>
              </div>
              <div className="hero-banner-stats">
                <div className="hero-banner-stat">
                  <strong>{workspace.overview.stats.total_reservations}</strong>
                  <span className="muted-text">dossiers suivis</span>
                </div>
                <div className="hero-banner-stat">
                  <strong>{formatCurrency(workspace.metrics.totalRevenue)}</strong>
                  <span className="muted-text">CA confirme</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {workspace.error ? <p className="feedback error">{workspace.error}</p> : null}

        <SegmentedTabs options={dashboardTabs} value={activeTab} onChange={setActiveTab} ariaLabel="Vues du dashboard" />

        {workspace.loading ? (
          <Panel title="Chargement du dashboard" description="LOKIFY consolide les donnees reservations, clients et catalogue.">
            <div className="empty-state">
              <strong>Preparation des vues</strong>
              <span>Les indicateurs apparaissent dans quelques instants.</span>
            </div>
          </Panel>
        ) : null}

        {!workspace.loading && activeTab === "reservations" ? (
          <>
            <section className="metric-grid">
              <MetricCard icon="document" label="Nouvelles demandes" value={workspace.overview.stats.draft_reservations} helper="A qualifier ou convertir" tone="warning" onClick={() => handleDashboardShortcut("drafts")} />
              <MetricCard icon="truck" label="Departs a traiter" value={upcomingDepartures.length} helper="Reservations confirmees a preparer" tone="success" onClick={() => handleDashboardShortcut("departures")} />
              <MetricCard icon="clock" label="Retours" value={upcomingReturns.length} helper="A cloturer dans les 72h" tone="info" onClick={() => handleDashboardShortcut("returns")} />
            </section>

            <div ref={planningPanelRef} tabIndex={-1} className="dashboard-scroll-anchor">
              <Panel
                className="planning-panel"
                title="Planning reservations"
                description="Vue calendrier, liste ou ma journee avec une lecture plus claire, plus aeree et mieux equilibree."
              >
              <div className="planning-shell">
                <div className="planning-toolbar">
                  <div className="planning-toolbar-primary">
                    <div className="toolbar-group">
                      <button type="button" className="button ghost" onClick={() => setReferenceDate((current) => shiftReferenceDate(current, horizonMode, -1))}>
                        <Icon name="arrowLeft" size={14} />
                        Periode precedente
                      </button>
                      <button type="button" className="button ghost" onClick={() => setReferenceDate((current) => shiftReferenceDate(current, horizonMode, 1))}>
                        Periode suivante
                        <Icon name="arrowRight" size={14} />
                      </button>
                    </div>
                    <div className="planning-period-card">
                      <span className="planning-toolbar-label">Periode active</span>
                      <strong>{buildPeriodLabel(horizonMode, referenceDate)}</strong>
                    </div>
                  </div>

                  <div className="planning-toolbar-secondary">
                    <div className="planning-segment">
                      <span className="planning-toolbar-label">Affichage</span>
                      <SegmentedTabs options={dashboardDisplayModes} value={displayMode} onChange={setDisplayMode} size="sm" ariaLabel="Mode de lecture" />
                    </div>
                    <div className="planning-segment">
                      <span className="planning-toolbar-label">Horizon</span>
                      <SegmentedTabs options={dashboardHorizonModes} value={horizonMode} onChange={setHorizonMode} size="sm" ariaLabel="Horizon temporel" />
                    </div>
                  </div>
                </div>

                <div className="planning-filter-panel">
                  <div className="planning-filter-grid">
                    <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
                      <option value="all">Tous les clients</option>
                      {workspace.clients.map((client) => <option key={client.id} value={client.id}>{client.full_name}</option>)}
                    </select>
                    <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
                      <option value="all">Tous les produits</option>
                      {workspace.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">Tous les statuts</option>
                      {reservationStatusOptions.map((status) => (
                        <option key={status.code} value={status.code}>
                          {reservationStatusMeta[status.code]?.label || status.label}
                        </option>
                      ))}
                    </select>
                    <SearchInput className="planning-search" value={search} onChange={setSearch} placeholder="Recherche client, produit ou categorie" />
                  </div>
                </div>

                <div className="planning-board-surface">
                    {displayMode === "calendar"
                      ? renderCalendarBoard({
                          reservations: filteredReservations,
                          referenceDate,
                          horizonMode,
                          reservationStatusMeta,
                          onOpenReservation: openReservationEditor,
                        })
                      : null}
                    {displayMode === "list" ? (
                      <DataTable
                        className="planning-data-table"
                        rows={filteredReservations}
                        emptyMessage="Aucune reservation sur cette plage."
                        columns={[
                          {
                            key: "status",
                            label: "Statut",
                            render: (row) => (
                              <StatusPill
                                tone={reservationStatusMeta[row.status]?.tone || "neutral"}
                                color={reservationStatusMeta[row.status]?.color}
                              >
                                {reservationStatusMeta[row.status]?.label || row.status}
                              </StatusPill>
                            ),
                          },
                          { key: "client", label: "Client", render: (row) => <div className="table-title"><strong>{row.client_name}</strong><small>{row.item_name}</small></div> },
                          { key: "period", label: "Periode", render: (row) => <div className="table-title"><strong>{formatDateTime(row.start_date)}</strong><small>Retour {formatDateTime(row.end_date)}</small></div> },
                          { key: "amount", label: "Montant", render: (row) => formatCurrency(row.total_amount) },
                          {
                            key: "action",
                            label: "Action",
                            render: (row) => (
                              <button type="button" className="button subtle" onClick={() => openReservationEditor(row.id)}>
                                Ouvrir
                              </button>
                            ),
                          },
                        ]}
                      />
                    ) : null}
                    {displayMode === "day" ? (
                      <div className="timeline-list planning-day-list">
                        {dayAgenda.length ? dayAgenda.map((reservation) => (
                          <button
                            key={reservation.id}
                            type="button"
                            className="timeline-item planning-timeline-button"
                            onClick={() => openReservationEditor(reservation.id)}
                          >
                            <div className="timeline-time">{formatDateTime(reservation.start_date)}</div>
                            <div className="timeline-copy">
                              <strong>{reservation.client_name}</strong>
                              <span>{reservation.item_name}</span>
                              <small>{reservation.category}</small>
                            </div>
                            <StatusPill
                              tone={reservationStatusMeta[reservation.status]?.tone || "neutral"}
                              color={reservationStatusMeta[reservation.status]?.color}
                            >
                              {reservationStatusMeta[reservation.status]?.label || reservation.status}
                            </StatusPill>
                          </button>
                        )) : <div className="empty-state planning-empty-state"><strong>Journee libre</strong><span>Aucune intervention prevue a cette date.</span></div>}
                      </div>
                    ) : null}
                </div>

                <div className="planning-secondary-grid">
                    <div ref={departuresPanelRef} tabIndex={-1} className="section-block planning-secondary-card">
                      <div className="section-block-header">
                        <div><h4>Priorites du jour</h4><p>Une lecture rapide des sorties a preparer.</p></div>
                        <StatusPill tone="info">{upcomingDepartures.length}</StatusPill>
                      </div>
                      <div className="planning-secondary-list">
                        {upcomingDepartures.slice(0, 3).map((reservation) => (
                        <button
                          key={reservation.id}
                          type="button"
                          className="planning-secondary-item planning-secondary-item-button"
                          onClick={() => openReservationEditor(reservation.id)}
                        >
                          <strong>{reservation.client_name}</strong>
                          <span className="muted-text">{formatDateTime(reservation.start_date)} · {reservation.item_name}</span>
                        </button>
                        ))}
                      </div>
                      {!upcomingDepartures.length ? <div className="empty-state planning-empty-state"><strong>Depart calme</strong><span>Aucune sortie urgente sur les prochaines 72 heures.</span></div> : null}
                    </div>

                    <div ref={returnsPanelRef} tabIndex={-1} className="section-block planning-secondary-card">
                      <div className="section-block-header">
                        <div><h4>Retours a preparer</h4><p>Pour organiser les controles et restitutions.</p></div>
                        <StatusPill tone="info">{upcomingReturns.length}</StatusPill>
                      </div>
                      <div className="planning-secondary-list">
                        {upcomingReturns.slice(0, 3).map((reservation) => (
                        <button
                          key={reservation.id}
                          type="button"
                          className="planning-secondary-item planning-secondary-item-button"
                          onClick={() => openReservationEditor(reservation.id)}
                        >
                          <strong>{reservation.client_name}</strong>
                          <span className="muted-text">{formatDateTime(reservation.end_date)} · {reservation.item_name}</span>
                        </button>
                        ))}
                      </div>
                      {!upcomingReturns.length ? <div className="empty-state planning-empty-state"><strong>Aucun retour a gerer</strong><span>Le planning reste fluide sur cette plage.</span></div> : null}
                    </div>
                  </div>
              </div>
              </Panel>
            </div>
          </>
        ) : null}

        {!workspace.loading && activeTab === "deliveries" ? (
          <section className="split-layout split-2-1">
            <Panel
              title="Plan des tournees"
              description="Une base claire pour coordonner la date, les zones et les arrets."
              actions={<input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />}
            >
              {deliveryError ? <p className="feedback error">{deliveryError}</p> : null}
              {deliveryFeedback ? <p className="feedback success">{deliveryFeedback}</p> : null}
              <div className="split-layout split-2-1">
                <div className="tour-list">
                  {visibleDeliveryRows.map((tour) => {
                    const tourStatus = deliveryTourStatusMeta[tour.status] || deliveryTourStatusMeta.draft;

                    return (
                      <article
                      key={tour.id}
                      className="tour-card"
                      onClick={() => setSelectedDeliveryId(tour.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedDeliveryId(tour.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedDelivery?.id === tour.id}
                    >
                      <div className="row-actions">
                        <strong>{tour.name}</strong>
                        <div className="row-actions">
                          <StatusPill tone={tourStatus.tone}>{tourStatus.label}</StatusPill>
                          <button
                            type="button"
                            className="button subtle"
                            onClick={(event) => {
                              event.stopPropagation();
                              startEditingTour(tour);
                            }}
                            disabled={workspace.mutating}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="button subtle"
                            onClick={(event) => {
                              event.stopPropagation();
                              void removeTour(tour.id);
                            }}
                            disabled={workspace.mutating}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                      <small>{formatDate(tour.date, { weekday: "long", day: "numeric", month: "long" })} · {tour.area}</small>
                        <small>{tour.driver}</small>
                        <small>{tour.reservations.length} affectation(s) · {tour.stops.length} arret(s)</small>
                      </article>
                    );
                  })}
                  {!visibleDeliveryRows.length ? (
                    <div className="empty-state">
                      <strong>Aucune tournee sur cette date</strong>
                      <span>Utilisez le panneau de droite pour creer une premiere tournee.</span>
                    </div>
                  ) : null}
                </div>
                <div className="route-map">
                  <div className="route-line" />
                  {selectedDelivery?.stops.length ? (
                    selectedDelivery.stops.map((stop, index) => {
                      const assignmentMeta =
                        stop.assignment_type ? deliveryAssignmentMeta[stop.assignment_type] : null;
                      const canMoveUp = index > 1;
                      const canMoveDown =
                        stop.kind !== "depot" && index < selectedDelivery.stops.length - 1;

                      return (
                        <div key={stop.id} className="route-stop">
                          <div className="row-actions">
                            <div className="stack">
                              <strong>{stop.label}</strong>
                              <small>{stop.scheduled_slot || "Horaire a confirmer"}</small>
                              <small>{stop.address || "Adresse a confirmer"}</small>
                            </div>
                            <div className="row-actions">
                              {assignmentMeta ? (
                                <StatusPill tone={assignmentMeta.tone}>{assignmentMeta.label}</StatusPill>
                              ) : null}
                              <button
                                type="button"
                                className="button subtle"
                                onClick={() => void moveSelectedStop(stop.id, "up")}
                                disabled={workspace.mutating || !canMoveUp}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="button subtle"
                                onClick={() => void moveSelectedStop(stop.id, "down")}
                                disabled={workspace.mutating || !canMoveDown}
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                          {stop.reservation_reference ? (
                            <small className="muted-text">
                              {stop.reservation_reference} · {stop.client_name || "Client a confirmer"}
                            </small>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="empty-state">
                      <strong>Aucun arret pour cette tournee</strong>
                      <span>Ajoutez des affectations a la creation pour structurer la route.</span>
                    </div>
                  )}
                </div>
              </div>
            </Panel>

            <Panel
              title={isEditingDelivery ? "Modifier la tournee" : "Ajouter une tournee"}
              description={
                isEditingDelivery
                  ? "Ajoutez ou retirez des affectations sans recreer la tournee."
                  : "Renseignez la date, la zone et les affectations de la tournee."
              }
            >
              <form className="form-grid" onSubmit={saveTour}>
                <div className="field">
                  <label htmlFor="tour-name">Nom de la tournee</label>
                  <input id="tour-name" value={tourForm.name} onChange={(event) => setTourForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex. Tournee premium nord" />
                </div>
                <div className="field">
                  <label htmlFor="tour-driver">Equipe</label>
                  <input id="tour-driver" value={tourForm.driver} onChange={(event) => setTourForm((current) => ({ ...current, driver: event.target.value }))} placeholder="Ex. Equipe logistique C" />
                </div>
                <div className="field">
                  <label htmlFor="tour-area">Zone</label>
                  <input id="tour-area" value={tourForm.area} onChange={(event) => setTourForm((current) => ({ ...current, area: event.target.value }))} placeholder="Ex. Ile-de-France sud" />
                </div>
                <div className="field">
                  <label htmlFor="tour-date">Date</label>
                  <input id="tour-date" type="date" value={tourForm.date} onChange={(event) => setTourForm((current) => ({ ...current, date: event.target.value }))} />
                </div>
                {isEditingDelivery ? (
                  <p className="muted-text">
                    Les affectations cochees resteront dans la tournee. Decochez pour les retirer.
                  </p>
                ) : null}
                <div className="section-block">
                  <div className="section-block-header">
                    <div>
                      <h4>Affectations du jour</h4>
                      <p>Selectionnez les departs et retours a integrer dans la tournee.</p>
                    </div>
                    <StatusPill tone="info">{deliveryCandidates.length}</StatusPill>
                  </div>
                  <div className="card-list">
                    {deliveryCandidates.map((candidate) => {
                      const assignmentMeta =
                        deliveryAssignmentMeta[candidate.assignment_type] || deliveryAssignmentMeta.delivery;

                      return (
                        <label key={candidate.key} className="detail-card">
                          <div className="row-actions">
                            <div className="stack">
                              <strong>{candidate.client_name}</strong>
                              <span className="muted-text">{candidate.item_name}</span>
                              <span className="muted-text">{candidate.reference} · {candidate.date_label}</span>
                            </div>
                            <div className="row-actions">
                              <StatusPill tone={assignmentMeta.tone}>{assignmentMeta.label}</StatusPill>
                              <input
                                type="checkbox"
                                checked={tourForm.assignment_keys.includes(candidate.key)}
                                onChange={() => toggleTourAssignment(candidate.key)}
                              />
                            </div>
                          </div>
                        </label>
                      );
                    })}
                    {!deliveryCandidates.length ? (
                      <div className="empty-state">
                        <strong>Aucune affectation disponible</strong>
                        <span>Choisissez une date avec des departs ou retours a traiter.</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="row-actions">
                  <button type="submit" className="button primary" disabled={workspace.mutating}>
                    {workspace.mutating
                      ? "Enregistrement..."
                      : isEditingDelivery
                        ? "Mettre a jour la tournee"
                        : "Ajouter une tournee"}
                  </button>
                  {isEditingDelivery ? (
                    <button
                      type="button"
                      className="button subtle"
                      onClick={resetTourComposer}
                      disabled={workspace.mutating}
                    >
                      Annuler l'edition
                    </button>
                  ) : null}
                </div>
              </form>
            </Panel>
          </section>
        ) : null}

        {!workspace.loading && activeTab === "stock" ? (
          <Panel
            title="Lecture du stock"
            description="Categorie par categorie, avec une vue grille ou tableau plus aeree."
            actions={<SegmentedTabs options={stockDisplayModes} value={stockDisplay} onChange={setStockDisplay} size="sm" ariaLabel="Affichage du stock" />}
          >
            <div className="stack">
              <div className="toolbar-spread">
                <SearchInput value={stockSearch} onChange={setStockSearch} placeholder="Rechercher un produit ou une categorie" />
                <StatusPill tone="info">{filteredProducts.length} produit(s)</StatusPill>
              </div>

              <div className="stock-grid">
                {stockRows.map((row) => (
                  <article key={row.id} className="stock-row">
                    <div>
                      <strong>{row.label}</strong>
                      <small>{row.products} produit(s) · {row.available} dispo · {row.reserved} loue(s)</small>
                    </div>
                    <StatusPill tone={row.unavailable ? "warning" : "success"}>{row.unavailable ? `${row.unavailable} indispo` : "Fluide"}</StatusPill>
                  </article>
                ))}
              </div>

              {stockDisplay === "table" ? (
                <DataTable
                  rows={filteredProducts}
                  emptyMessage="Aucun produit dans le parc."
                  columns={[
                    { key: "product", label: "Produit", render: (row) => <div className="table-title"><strong>{row.name}</strong><small>{row.category}</small></div> },
                    { key: "stock", label: "Quantite", render: (row) => row.stock },
                    { key: "availableUnits", label: "Disponible", render: (row) => row.availableUnits },
                    {
                      key: "trackedUnits",
                      label: "Suivi unite",
                      render: (row) =>
                        row.profile.serial_tracking ? (
                          <div className="table-title">
                            <strong>{row.trackedUnitsCount} unite(s)</strong>
                            <small>{row.checkedOutUnits} sortie(s) Â· {row.unitCoverageGap} a renseigner</small>
                          </div>
                        ) : (
                          "Non"
                        ),
                    },
                    { key: "status", label: "Statut", render: (row) => <StatusPill tone={row.statusMeta.tone}>{row.statusMeta.label}</StatusPill> },
                  ]}
                />
              ) : (
                <div className="card-list">
                  {filteredProducts.map((product) => (
                    <article key={product.id} className="category-card">
                      <header>
                        <div><strong>{product.name}</strong><p className="table-subcopy">{product.category}</p></div>
                        <StatusPill tone={product.statusMeta.tone}>{product.statusMeta.label}</StatusPill>
                      </header>
                      <div className="summary-cards">
                        <div className="detail-card"><strong>{product.stock}</strong><span className="muted-text">quantite totale</span></div>
                        <div className="detail-card"><strong>{product.availableUnits}</strong><span className="muted-text">disponible(s)</span></div>
                        {product.profile.serial_tracking ? (
                          <div className="detail-card"><strong>{product.trackedUnitsCount}</strong><span className="muted-text">unite(s) suivie(s)</span></div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <Panel
                title="Journal des stocks"
                description="Les derniers mouvements terrain, creations d'unites et changements d'etat."
              >
                <DataTable
                  rows={recentStockMovements}
                  emptyMessage="Aucun mouvement de stock enregistre pour le moment."
                  columns={[
                    {
                      key: "movement",
                      label: "Mouvement",
                      render: (row) => (
                        <StatusPill tone={stockMovementMeta[row.movement_type]?.tone || "neutral"}>
                          {stockMovementMeta[row.movement_type]?.label || row.movement_type}
                        </StatusPill>
                      ),
                    },
                    {
                      key: "item",
                      label: "Produit",
                      render: (row) => (
                        <div className="table-title">
                          <strong>{row.item_name}</strong>
                          <small>{row.unit_label || "Stock global"}</small>
                        </div>
                      ),
                    },
                    {
                      key: "transition",
                      label: "Etat",
                      render: (row) => (
                        <div className="table-title">
                          <strong>{row.from_state || "-"}{" -> "}{row.to_state || "-"}</strong>
                          <small>{row.quantity} unite(s)</small>
                        </div>
                      ),
                    },
                    { key: "reservation", label: "Reservation", render: (row) => row.reservation_reference || "-" },
                    { key: "date", label: "Date", render: (row) => formatDateTime(row.occurred_at) },
                  ]}
                />
              </Panel>
            </div>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function DashboardPage() {
  const { ready, user } = useAuth();

  if (!ready) {
    return (
      <AppShell>
        <div className="page-stack" />
      </AppShell>
    );
  }

  return isSuperAdmin(user) ? <SuperAdminDashboard /> : <ProviderDashboardPage />;
}
