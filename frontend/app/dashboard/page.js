"use client";

import { useDeferredValue, useEffect, useState } from "react";

import AppShell from "../../components/app-shell";
import BrandLogo from "../../components/brand-logo";
import DataTable from "../../components/data-table";
import Icon from "../../components/icon";
import MetricCard from "../../components/metric-card";
import Panel from "../../components/panel";
import SearchInput from "../../components/search-input";
import SegmentedTabs from "../../components/segmented-tabs";
import StatusPill from "../../components/status-pill";
import useLokifyWorkspace from "../../hooks/use-lokify-workspace";
import {
  dashboardDisplayModes,
  dashboardHorizonModes,
  dashboardTabs,
  reservationStatusMeta,
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

const renderCalendarBoard = ({ reservations, referenceDate, horizonMode }) => {
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
                  <div key={reservation.id} className="calendar-event planning-event-card">
                    <div className="planning-event-copy">
                      <strong>{reservation.client_name}</strong>
                      <small>{reservation.item_name}</small>
                    </div>
                    <div className="planning-event-footer">
                      <small>{formatDateTime(reservation.start_date)}</small>
                      <StatusPill tone={reservationStatusMeta[reservation.status]?.tone || "neutral"}>
                        {reservationStatusMeta[reservation.status]?.label || reservation.status}
                      </StatusPill>
                    </div>
                  </div>
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

export default function DashboardPage() {
  const workspace = useLokifyWorkspace();
  const [activeTab, setActiveTab] = useState("reservations");
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
  const [customTours, setCustomTours] = useState([]);
  const [tourForm, setTourForm] = useState({
    name: "",
    driver: "",
    area: "",
    date: toDateInputValue(new Date()),
  });
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const deferredStockSearch = useDeferredValue(stockSearch.trim().toLowerCase());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (dashboardTabs.some((tab) => tab.id === requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, []);

  const timeWindow = getTimeWindow(horizonMode, referenceDate);
  const filteredReservations = workspace.reservations.filter((reservation) => {
    const startDate = new Date(reservation.start_date);

    if (startDate < timeWindow.start || startDate > timeWindow.end) {
      return false;
    }
    if (clientFilter !== "all" && reservation.client_id !== clientFilter) {
      return false;
    }
    if (productFilter !== "all" && reservation.item_id !== productFilter) {
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

  const today = new Date();
  const upcomingDepartures = workspace.reservations.filter((reservation) => {
    const startDate = new Date(reservation.start_date);
    return reservation.status === "confirmed" && startDate >= startOfDay(today) && startDate <= addDays(today, 3);
  });
  const upcomingReturns = workspace.reservations.filter((reservation) => {
    const endDate = new Date(reservation.end_date);
    return reservation.status !== "cancelled" && endDate >= startOfDay(today) && endDate <= addDays(today, 3);
  });
  const dayAgenda = filteredReservations.filter(
    (reservation) => isSameDay(reservation.start_date, referenceDate) || isSameDay(reservation.end_date, referenceDate)
  );

  const deliveryRows = [...workspace.deliveries, ...customTours];
  const deliveriesForDate = deliveryRows.filter((tour) => toDateInputValue(tour.date) === deliveryDate);
  const selectedDelivery = deliveriesForDate[0] || deliveryRows[0];

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

  const addCustomTour = (event) => {
    event.preventDefault();
    if (!tourForm.name || !tourForm.area || !tourForm.date) {
      return;
    }

    setCustomTours((current) => [
      ...current,
      {
        id: `custom-tour-${current.length + 1}`,
        name: tourForm.name,
        driver: tourForm.driver || "Equipe a affecter",
        area: tourForm.area,
        date: new Date(tourForm.date).toISOString(),
        status: "draft",
        reservations: [],
        stops: [
          { id: `${tourForm.name}-1`, label: "Preparation", slot: "08:00", address: "Depot LOKIFY" },
          { id: `${tourForm.name}-2`, label: "Client a confirmer", slot: "11:00", address: tourForm.area },
        ],
      },
    ]);
    setDeliveryDate(tourForm.date);
    setTourForm({ name: "", driver: "", area: "", date: toDateInputValue(new Date()) });
  };

  return (
    <AppShell>
      <div className="page-stack">
        <section className="hero-banner">
          <div className="page-heading">
            <p className="eyebrow">Dashboard</p>
            <h1>Une lecture plus claire de vos reservations, livraisons et mouvements de stock.</h1>
            <p>LOKIFY garde son design et gagne en structure, en respiration et en lisibilite.</p>
          </div>
          <div className="hero-banner-card">
            <div className="login-brand">
              <BrandLogo className="brand-logo-dashboard" />
            </div>
            <div>
              <strong>{workspace.metrics.parkUsageRate}% du parc actuellement mobilise</strong>
              <p className="muted-text">
                {workspace.metrics.rentedUnits} unite(s) engagee(s) sur {workspace.metrics.totalStock} en stock
              </p>
            </div>
            <div className="summary-cards">
              <div className="detail-card">
                <strong>{workspace.overview.stats.total_reservations}</strong>
                <span className="muted-text">dossiers suivis</span>
              </div>
              <div className="detail-card">
                <strong>{formatCurrency(workspace.metrics.totalRevenue)}</strong>
                <span className="muted-text">chiffre d'affaires confirme</span>
              </div>
            </div>
          </div>
        </section>

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
              <MetricCard icon="document" label="Nouvelles demandes" value={workspace.overview.stats.draft_reservations} helper="A qualifier ou convertir" tone="warning" />
              <MetricCard icon="truck" label="Departs a traiter" value={upcomingDepartures.length} helper="Reservations confirmees a preparer" tone="success" />
              <MetricCard icon="clock" label="Retours" value={upcomingReturns.length} helper="A cloturer dans les 72h" tone="info" />
            </section>

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
                      {Object.entries(reservationStatusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                    </select>
                    <SearchInput className="planning-search" value={search} onChange={setSearch} placeholder="Recherche client, produit ou categorie" />
                  </div>
                </div>

                <div className="planning-board-surface">
                    {displayMode === "calendar" ? renderCalendarBoard({ reservations: filteredReservations, referenceDate, horizonMode }) : null}
                    {displayMode === "list" ? (
                      <DataTable
                        className="planning-data-table"
                        rows={filteredReservations}
                        emptyMessage="Aucune reservation sur cette plage."
                        columns={[
                          { key: "status", label: "Statut", render: (row) => <StatusPill tone={reservationStatusMeta[row.status]?.tone || "neutral"}>{reservationStatusMeta[row.status]?.label || row.status}</StatusPill> },
                          { key: "client", label: "Client", render: (row) => <div className="table-title"><strong>{row.client_name}</strong><small>{row.item_name}</small></div> },
                          { key: "period", label: "Periode", render: (row) => <div className="table-title"><strong>{formatDateTime(row.start_date)}</strong><small>Retour {formatDateTime(row.end_date)}</small></div> },
                          { key: "amount", label: "Montant", render: (row) => formatCurrency(row.total_amount) },
                        ]}
                      />
                    ) : null}
                    {displayMode === "day" ? (
                      <div className="timeline-list planning-day-list">
                        {dayAgenda.length ? dayAgenda.map((reservation) => (
                          <div key={reservation.id} className="timeline-item">
                            <div className="timeline-time">{formatDateTime(reservation.start_date)}</div>
                            <div className="timeline-copy">
                              <strong>{reservation.client_name}</strong>
                              <span>{reservation.item_name}</span>
                              <small>{reservation.category}</small>
                            </div>
                            <StatusPill tone={reservationStatusMeta[reservation.status]?.tone || "neutral"}>{reservationStatusMeta[reservation.status]?.label || reservation.status}</StatusPill>
                          </div>
                        )) : <div className="empty-state planning-empty-state"><strong>Journee libre</strong><span>Aucune intervention prevue a cette date.</span></div>}
                      </div>
                    ) : null}
                </div>

                <div className="planning-secondary-grid">
                    <div className="section-block planning-secondary-card">
                      <div className="section-block-header">
                        <div><h4>Priorites du jour</h4><p>Une lecture rapide des sorties a preparer.</p></div>
                        <StatusPill tone="info">{upcomingDepartures.length}</StatusPill>
                      </div>
                      <div className="planning-secondary-list">
                        {upcomingDepartures.slice(0, 3).map((reservation) => (
                        <div key={reservation.id} className="planning-secondary-item">
                          <strong>{reservation.client_name}</strong>
                          <span className="muted-text">{formatDateTime(reservation.start_date)} · {reservation.item_name}</span>
                        </div>
                        ))}
                      </div>
                      {!upcomingDepartures.length ? <div className="empty-state planning-empty-state"><strong>Depart calme</strong><span>Aucune sortie urgente sur les prochaines 72 heures.</span></div> : null}
                    </div>

                    <div className="section-block planning-secondary-card">
                      <div className="section-block-header">
                        <div><h4>Retours a preparer</h4><p>Pour organiser les controles et restitutions.</p></div>
                      </div>
                      <div className="planning-secondary-list">
                        {upcomingReturns.slice(0, 3).map((reservation) => (
                        <div key={reservation.id} className="planning-secondary-item">
                          <strong>{reservation.client_name}</strong>
                          <span className="muted-text">{formatDateTime(reservation.end_date)} · {reservation.item_name}</span>
                        </div>
                        ))}
                      </div>
                      {!upcomingReturns.length ? <div className="empty-state planning-empty-state"><strong>Aucun retour a gerer</strong><span>Le planning reste fluide sur cette plage.</span></div> : null}
                    </div>
                  </div>
              </div>
            </Panel>
          </>
        ) : null}

        {!workspace.loading && activeTab === "deliveries" ? (
          <section className="split-layout split-2-1">
            <Panel
              title="Plan des tournees"
              description="Une base claire pour coordonner la date, les zones et les arrets."
              actions={<input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />}
            >
              <div className="split-layout split-2-1">
                <div className="tour-list">
                  {(deliveriesForDate.length ? deliveriesForDate : deliveryRows).map((tour) => (
                    <article key={tour.id} className="tour-card">
                      <div className="row-actions">
                        <strong>{tour.name}</strong>
                        <StatusPill tone={tour.status === "planned" ? "success" : "warning"}>{tour.status === "planned" ? "Planifiee" : "A preparer"}</StatusPill>
                      </div>
                      <small>{formatDate(tour.date, { weekday: "long", day: "numeric", month: "long" })} · {tour.area}</small>
                      <small>{tour.driver}</small>
                    </article>
                  ))}
                </div>
                <div className="route-map">
                  <div className="route-line" />
                  {selectedDelivery?.stops.map((stop) => (
                    <div key={stop.id} className="route-stop">
                      <strong>{stop.label}</strong>
                      <small>{stop.slot}</small>
                      <small>{stop.address}</small>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Ajouter une tournee" description="Structure preparatoire pour la logistique.">
              <form className="form-grid" onSubmit={addCustomTour}>
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
                <button type="submit" className="button primary">Ajouter une tournee</button>
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
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
