"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import AppShell from "../../components/app-shell";
import Icon from "../../components/icon";
import ModalShell from "../../components/modal-shell";
import SearchInput from "../../components/search-input";
import SegmentedTabs from "../../components/segmented-tabs";
import StatusPill from "../../components/status-pill";
import { apiRequest } from "../../lib/api";
import {
  buildReservationStatusMeta,
  defaultReservationStatuses,
  deliveryAssignmentMeta,
} from "../../lib/lokify-data";
import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  formatDate,
  formatDateTime,
  formatMonthLabel,
  formatTime,
  getDaysInRange,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "../../lib/date";

const planningHorizonModes = [
  { id: "day", label: "Jour" },
  { id: "week", label: "Semaine" },
  { id: "month", label: "Mois" },
];

const planningToneColors = {
  success: "#1C9C6B",
  info: "#2F7DE1",
  warning: "#E39B2E",
  danger: "#D64F4F",
  neutral: "#7A869A",
};

const agendaStartHour = 7;
const agendaEndHour = 22;
const agendaMinimumMinutes = 45;
const initialPlanningState = {
  loading: true,
  error: "",
  data: null,
};

const formatDayKey = (value) => new Date(value).toISOString().slice(0, 10);
const formatWeekdayLabel = (value, style = "short") =>
  new Intl.DateTimeFormat("fr-FR", { weekday: style }).format(new Date(value));
const formatDayLabel = (value, monthStyle = "short") =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: monthStyle }).format(new Date(value));

const buildMonthBoardDays = (referenceDate) => {
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);
  const boardStart = startOfWeek(monthStart);
  const boardEnd = endOfWeek(monthEnd);
  const totalDays = Math.round((boardEnd.getTime() - boardStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  return getDaysInRange(boardStart, totalDays);
};

const buildBoardDays = (mode, referenceDate) => {
  if (mode === "day") {
    return [startOfDay(referenceDate)];
  }

  if (mode === "month") {
    return buildMonthBoardDays(referenceDate);
  }

  return getDaysInRange(startOfWeek(referenceDate), 7);
};

const getTimeWindow = (mode, referenceDate) => {
  if (mode === "day") {
    return { start: startOfDay(referenceDate), end: endOfDay(referenceDate) };
  }

  if (mode === "month") {
    return {
      start: startOfWeek(startOfMonth(referenceDate)),
      end: endOfWeek(endOfMonth(referenceDate)),
    };
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

  return `${formatDate(weekStart, {
    day: "numeric",
    month: "short",
  })} - ${formatDate(weekEnd, {
    day: "numeric",
    month: "short",
  })}`;
};

const toRgba = (hexColor, alpha) => {
  if (!/^#(?:[0-9a-fA-F]{6})$/.test(hexColor || "")) {
    return `rgba(122, 134, 154, ${alpha})`;
  }

  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const getMinuteOffset = (date, day) => {
  const dayStart = new Date(day);
  dayStart.setHours(agendaStartHour, 0, 0, 0);
  return Math.max(0, Math.round((new Date(date).getTime() - dayStart.getTime()) / 60000));
};

const buildHourSlots = () =>
  Array.from({ length: agendaEndHour - agendaStartHour + 1 }, (_, index) => agendaStartHour + index);

const parseSlotDate = (dayValue, slotValue) => {
  if (!slotValue || !/^\d{2}:\d{2}$/.test(slotValue)) {
    return null;
  }

  const [hours, minutes] = slotValue.split(":").map((value) => Number(value));
  const nextDate = new Date(dayValue);
  nextDate.setHours(hours, minutes, 0, 0);
  return nextDate;
};

const overlapsDay = (startValue, endValue, dayValue) => {
  const dayStart = startOfDay(dayValue);
  const dayEnd = endOfDay(dayValue);
  return new Date(startValue) <= dayEnd && new Date(endValue) >= dayStart;
};

const clampDate = (value, min, max) => {
  const nextValue = new Date(value);
  return new Date(Math.min(Math.max(nextValue.getTime(), min.getTime()), max.getTime()));
};

const getReservationTypeLabel = (reservation) => {
  if (reservation.fulfillment_mode === "onsite") {
    return "Intervention";
  }

  return "Reservation";
};

const buildReservationSummary = (reservation) => {
  const primaryLabel = reservation.primary_item_name || reservation.item_name || "Produit";

  if (Number(reservation.line_count || 0) > 1) {
    return `${primaryLabel} +${Number(reservation.line_count) - 1} produit(s)`;
  }

  return primaryLabel;
};

const buildAgendaEvents = ({
  reservations,
  deliveries,
  visibleDays,
  filteredReservationIds,
  reservationStatusMeta,
}) => {
  const dayBoundsByKey = visibleDays.reduce((accumulator, day) => {
    accumulator[formatDayKey(day)] = {
      start: startOfDay(day),
      end: endOfDay(day),
    };
    return accumulator;
  }, {});

  const reservationsById = reservations.reduce((accumulator, reservation) => {
    accumulator[reservation.id] = reservation;
    return accumulator;
  }, {});

  const events = [];

  reservations.forEach((reservation) => {
    visibleDays.forEach((day) => {
      if (!overlapsDay(reservation.start_date, reservation.end_date, day)) {
        return;
      }

      const dayKey = formatDayKey(day);
      const bounds = dayBoundsByKey[dayKey];
      const rawStart = clampDate(reservation.start_date, bounds.start, bounds.end);
      const rawEnd = clampDate(reservation.end_date, bounds.start, bounds.end);
      const fallbackEnd = new Date(rawStart.getTime() + agendaMinimumMinutes * 60000);
      const clippedEnd = rawEnd > rawStart ? rawEnd : fallbackEnd;

      events.push({
        id: `reservation:${reservation.id}:${dayKey}`,
        source_type: "reservation",
        reservation_id: reservation.id,
        day_key: dayKey,
        start: rawStart,
        end: clippedEnd,
        title: reservation.client_name,
        subtitle: buildReservationSummary(reservation),
        kind_label: getReservationTypeLabel(reservation),
        tone: reservationStatusMeta[reservation.status]?.tone || "neutral",
        color: reservationStatusMeta[reservation.status]?.color || reservation.status_color,
        status_label: reservationStatusMeta[reservation.status]?.label || reservation.status_label,
        reference: reservation.reference,
        reservation,
      });
    });
  });

  deliveries.forEach((delivery) => {
    const dayKey = formatDayKey(delivery.date);

    if (!dayBoundsByKey[dayKey]) {
      return;
    }

    delivery.assignments.forEach((assignment) => {
      if (!filteredReservationIds.has(assignment.reservation_id)) {
        return;
      }

      const linkedReservation = reservationsById[assignment.reservation_id] || null;
      const deliveryMeta =
        deliveryAssignmentMeta[assignment.assignment_type] || deliveryAssignmentMeta.delivery;
      const start = parseSlotDate(delivery.date, assignment.scheduled_slot) || new Date(delivery.date);
      const end = new Date(start.getTime() + agendaMinimumMinutes * 60000);

      events.push({
        id: `delivery:${delivery.id}:${assignment.id}`,
        source_type: "delivery",
        reservation_id: assignment.reservation_id,
        delivery_id: delivery.id,
        assignment_id: assignment.id,
        assignment_type: assignment.assignment_type,
        day_key: dayKey,
        start,
        end,
        title: assignment.client_name || linkedReservation?.client_name || "Intervention",
        subtitle: assignment.item_name || linkedReservation?.item_name || "Produit",
        kind_label: deliveryMeta.label,
        tone: deliveryMeta.tone,
        color: planningToneColors[deliveryMeta.tone] || planningToneColors.info,
        status_label: delivery.name,
        delivery,
        linkedReservation,
        stop_label: assignment.stop_label,
        stop_address: assignment.stop_address,
        scheduled_slot: assignment.scheduled_slot,
      });
    });
  });

  return events.sort((left, right) => left.start - right.start || left.end - right.end);
};

const buildEventLayoutsByDay = (visibleDays, events) =>
  visibleDays.reduce((accumulator, day) => {
    const dayKey = formatDayKey(day);
    const dayEvents = events.filter((event) => event.day_key === dayKey);
    const laneEndTimes = [];

    const laidOutEvents = dayEvents.map((event) => {
      let laneIndex = laneEndTimes.findIndex((endTime) => event.start >= endTime);
      if (laneIndex === -1) {
        laneIndex = laneEndTimes.length;
      }

      laneEndTimes[laneIndex] = event.end;

      return {
        ...event,
        lane_index: laneIndex,
      };
    });

    const laneCount = Math.max(laidOutEvents.length ? laneEndTimes.length : 1, 1);

    accumulator[dayKey] = laidOutEvents.map((event) => ({
      ...event,
      lane_count: laneCount,
    }));
    return accumulator;
  }, {});

const openReservationEditor = (reservationId) => {
  if (typeof window === "undefined" || !reservationId) {
    return;
  }

  window.location.assign(`/reservations?edit=${encodeURIComponent(reservationId)}`);
};

const getEventCardStyle = (event, day) => {
  const agendaStart = new Date(day);
  agendaStart.setHours(agendaStartHour, 0, 0, 0);
  const agendaEnd = new Date(day);
  agendaEnd.setHours(agendaEndHour, 0, 0, 0);

  const clippedStart = clampDate(event.start, agendaStart, agendaEnd);
  const clippedEnd = clampDate(event.end, agendaStart, agendaEnd);
  const totalMinutes = (agendaEndHour - agendaStartHour) * 60;
  const startMinutes = getMinuteOffset(clippedStart, day);
  const durationMinutes = Math.max(
    agendaMinimumMinutes,
    Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 60000) || agendaMinimumMinutes
  );
  const top = Math.max(0, Math.min(94, (startMinutes / totalMinutes) * 100));
  const availableMinutes = Math.max(agendaMinimumMinutes, totalMinutes - Math.min(startMinutes, totalMinutes));
  const height = Math.min(
    100 - top,
    Math.max(6, (Math.min(durationMinutes, availableMinutes) / totalMinutes) * 100)
  );
  const width = 100 / event.lane_count;
  const accentColor = event.color || planningToneColors[event.tone] || planningToneColors.neutral;

  return {
    top: `${top}%`,
    height: `${height}%`,
    width: `calc(${width}% - 0.45rem)`,
    left: `calc(${event.lane_index * width}% + 0.225rem)`,
    borderColor: toRgba(accentColor, 0.32),
    backgroundColor: toRgba(accentColor, 0.14),
    boxShadow: `0 8px 16px ${toRgba(accentColor, 0.12)}`,
  };
};

const renderAgendaGrid = ({
  mode,
  visibleDays,
  eventLayoutsByDay,
  onSelectEvent,
}) => {
  const hourSlots = buildHourSlots();

  return (
    <div className={`planning-agenda-grid planning-agenda-grid-${mode}`}>
      <div className="planning-agenda-time-column" aria-hidden="true">
        <div className="planning-agenda-time-column-head" />
        <div className="planning-agenda-time-track">
          {hourSlots.map((hour) => (
            <div key={`time-${hour}`} className="planning-agenda-time-slot">
              {`${String(hour).padStart(2, "0")}:00`}
            </div>
          ))}
        </div>
      </div>

      <div
        className="planning-agenda-day-columns"
        style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))` }}
      >
        {visibleDays.map((day) => {
          const dayKey = formatDayKey(day);
          const dayEvents = eventLayoutsByDay[dayKey] || [];
          const isToday = dayKey === formatDayKey(new Date());

          return (
            <section key={dayKey} className={`planning-agenda-day-column ${isToday ? "today" : ""}`.trim()}>
              <header className="planning-agenda-day-header">
                <span>{formatWeekdayLabel(day, "short")}</span>
                <strong>{formatDayLabel(day, mode === "day" ? "long" : "short")}</strong>
              </header>

              <div className="planning-agenda-day-body">
                <div className="planning-agenda-day-lines" aria-hidden="true">
                  {hourSlots.map((hour) => (
                    <div key={`${dayKey}-hour-${hour}`} className="planning-agenda-hour-line" />
                  ))}
                </div>

                <div className="planning-agenda-day-events">
                  {dayEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`planning-agenda-event planning-agenda-event-${event.source_type}`.trim()}
                      style={getEventCardStyle(event, day)}
                      onClick={() => onSelectEvent(event)}
                    >
                      <span className="planning-agenda-event-type">{event.kind_label}</span>
                      <strong>{event.title}</strong>
                      <small>{event.subtitle}</small>
                      <span className="planning-agenda-event-time">
                        {`${formatTime(event.start)} - ${formatTime(event.end)}`}
                      </span>
                    </button>
                  ))}

                  {!dayEvents.length ? (
                    <div className="planning-agenda-empty-day">
                      <span>Aucune intervention</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

const renderMonthGrid = ({
  visibleDays,
  eventLayoutsByDay,
  onSelectEvent,
  referenceDate,
}) => (
  <div className="planning-month-grid">
    {visibleDays.map((day) => {
      const dayKey = formatDayKey(day);
      const dayEvents = eventLayoutsByDay[dayKey] || [];
      const isToday = dayKey === formatDayKey(new Date());
      const isOutsideMonth = new Date(day).getMonth() !== new Date(referenceDate).getMonth();
      const visibleEvents = dayEvents.slice(0, 4);

      return (
        <section
          key={dayKey}
          className={`planning-month-day ${isToday ? "today" : ""} ${isOutsideMonth ? "outside" : ""}`.trim()}
        >
          <header className="planning-month-day-header">
            <span>{formatWeekdayLabel(day, "short")}</span>
            <strong>{new Date(day).getDate()}</strong>
          </header>

          <div className="planning-month-day-events">
            {visibleEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`planning-month-event planning-month-event-${event.source_type}`.trim()}
                style={{
                  borderColor: toRgba(event.color || planningToneColors[event.tone] || planningToneColors.neutral, 0.28),
                  backgroundColor: toRgba(
                    event.color || planningToneColors[event.tone] || planningToneColors.neutral,
                    0.12
                  ),
                }}
                onClick={() => onSelectEvent(event)}
              >
                <span>{formatTime(event.start)}</span>
                <strong>{event.title}</strong>
                <small>{event.kind_label}</small>
              </button>
            ))}

            {!dayEvents.length ? <div className="planning-month-empty">Libre</div> : null}

            {dayEvents.length > visibleEvents.length ? (
              <span className="planning-month-more">+{dayEvents.length - visibleEvents.length} autres</span>
            ) : null}
          </div>
        </section>
      );
    })}
  </div>
);

export default function PlanningPage() {
  const [planningState, setPlanningState] = useState(initialPlanningState);
  const [horizonMode, setHorizonMode] = useState("week");
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    let cancelled = false;
    const timeWindow = getTimeWindow(horizonMode, referenceDate);

    const loadPlanning = async () => {
      setPlanningState((current) => ({
        ...current,
        loading: true,
        error: "",
      }));

      try {
        const planningData = await apiRequest(
          `/planning?start=${encodeURIComponent(timeWindow.start.toISOString())}&end=${encodeURIComponent(
            timeWindow.end.toISOString()
          )}`
        );

        if (cancelled) {
          return;
        }

        setPlanningState({
          loading: false,
          error: "",
          data: planningData,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPlanningState({
          loading: false,
          error: error.message || "Impossible de charger le planning.",
          data: null,
        });
      }
    };

    void loadPlanning();

    return () => {
      cancelled = true;
    };
  }, [horizonMode, referenceDate]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    const reservations = planningState.data?.reservations || [];
    const deliveries = planningState.data?.deliveries || [];
    const reservationStillExists = reservations.some((reservation) => reservation.id === selectedEvent.reservation_id);
    const deliveryStillExists =
      !selectedEvent.delivery_id || deliveries.some((delivery) => delivery.id === selectedEvent.delivery_id);

    if (!reservationStillExists || !deliveryStillExists) {
      setSelectedEvent(null);
    }
  }, [planningState.data, selectedEvent]);

  const planningData = planningState.data;
  const reservationStatuses = planningData?.statuses || defaultReservationStatuses;
  const reservationStatusMeta = buildReservationStatusMeta(reservationStatuses);
  const products = planningData?.products || [];
  const visibleDays = useMemo(() => buildBoardDays(horizonMode, referenceDate), [horizonMode, referenceDate]);

  const filteredReservations = useMemo(
    () =>
      (planningData?.reservations || []).filter((reservation) => {
        if (statusFilter !== "all" && reservation.status !== statusFilter) {
          return false;
        }

        if (
          productFilter !== "all" &&
          !reservation.lines.some((line) => line.item_id === productFilter)
        ) {
          return false;
        }

        if (!deferredSearch) {
          return true;
        }

        const haystack = [
          reservation.reference,
          reservation.client_name,
          reservation.item_name,
          reservation.primary_item_name,
          reservation.category,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(deferredSearch);
      }),
    [planningData?.reservations, statusFilter, productFilter, deferredSearch]
  );

  const filteredReservationIds = useMemo(
    () => new Set(filteredReservations.map((reservation) => reservation.id)),
    [filteredReservations]
  );

  const agendaEvents = useMemo(
    () =>
      buildAgendaEvents({
        reservations: filteredReservations,
        deliveries: planningData?.deliveries || [],
        visibleDays,
        filteredReservationIds,
        reservationStatusMeta,
      }),
    [filteredReservations, planningData?.deliveries, visibleDays, filteredReservationIds, reservationStatusMeta]
  );

  const eventLayoutsByDay = useMemo(
    () => buildEventLayoutsByDay(visibleDays, agendaEvents),
    [visibleDays, agendaEvents]
  );

  const eventCount = agendaEvents.length;

  return (
    <AppShell>
      <div className="page-stack">
        <header className="page-header">
          <div className="page-heading">
            <p className="panel-eyebrow">Planning</p>
            <h1>Agenda</h1>
            <p>
              Une vue dediee pour organiser les journees, les semaines et les mois, sans doublon
              avec le dashboard.
            </p>
          </div>

          <div className="page-header-actions">
            <button type="button" className="button ghost" onClick={() => setReferenceDate(new Date())}>
              <Icon name="clock" size={14} />
              Aujourd&apos;hui
            </button>
          </div>
        </header>

        <section className="planning-agenda-shell">
          <div className="planning-agenda-toolbar">
            <div className="planning-agenda-toolbar-primary">
              <div className="toolbar-group">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setReferenceDate((current) => shiftReferenceDate(current, horizonMode, -1))}
                >
                  <Icon name="arrowLeft" size={14} />
                  Precedent
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setReferenceDate((current) => shiftReferenceDate(current, horizonMode, 1))}
                >
                  Suivant
                  <Icon name="arrowRight" size={14} />
                </button>
              </div>

              <div className="planning-agenda-period">
                <span>Periode active</span>
                <strong>{buildPeriodLabel(horizonMode, referenceDate)}</strong>
              </div>
            </div>

            <div className="planning-agenda-toolbar-secondary">
              <SegmentedTabs
                options={planningHorizonModes}
                value={horizonMode}
                onChange={setHorizonMode}
                size="sm"
                ariaLabel="Vue du planning"
              />
            </div>
          </div>

          <div className="planning-agenda-filters">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tous les statuts</option>
              {reservationStatuses.map((status) => (
                <option key={status.code} value={status.code}>
                  {reservationStatusMeta[status.code]?.label || status.label}
                </option>
              ))}
            </select>

            <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
              <option value="all">Tous les produits</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>

            <SearchInput
              className="planning-agenda-search"
              value={search}
              onChange={setSearch}
              placeholder="Client, produit ou reference"
            />

            <div className="planning-agenda-inline-count">
              <span>{eventCount}</span>
              <small>evenement(s)</small>
            </div>
          </div>

          {planningState.error ? (
            <div className="empty-state planning-agenda-feedback">
              <strong>Planning indisponible</strong>
              <span>{planningState.error}</span>
            </div>
          ) : null}

          {planningState.loading ? (
            <div className="empty-state planning-agenda-feedback">
              <strong>Chargement du planning</strong>
              <span>Les reservations et interventions reelles sont en cours de synchronisation.</span>
            </div>
          ) : null}

          {!planningState.loading && planningData ? (
            horizonMode === "month" ? (
              renderMonthGrid({
                visibleDays,
                eventLayoutsByDay,
                onSelectEvent: setSelectedEvent,
                referenceDate,
              })
            ) : (
              renderAgendaGrid({
                mode: horizonMode,
                visibleDays,
                eventLayoutsByDay,
                onSelectEvent: setSelectedEvent,
                referenceDate,
              })
            )
          ) : null}
        </section>
      </div>

      <ModalShell
        open={Boolean(selectedEvent)}
        title={selectedEvent ? selectedEvent.title : ""}
        description={
          selectedEvent
            ? `${selectedEvent.kind_label} - ${formatDateTime(selectedEvent.start)}`
            : ""
        }
        size="md"
        onClose={() => setSelectedEvent(null)}
        footer={
          selectedEvent ? (
            <>
              <button type="button" className="button ghost" onClick={() => setSelectedEvent(null)}>
                Fermer
              </button>
              {selectedEvent.reservation_id ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={() => openReservationEditor(selectedEvent.reservation_id)}
                >
                  Modifier la reservation
                </button>
              ) : null}
            </>
          ) : null
        }
      >
        {selectedEvent ? (
          <div className="planning-detail-grid">
            <div className="planning-detail-row">
              <span>Type</span>
              <div>
                <strong>{selectedEvent.kind_label}</strong>
                <StatusPill tone={selectedEvent.tone} color={selectedEvent.color}>
                  {selectedEvent.source_type === "reservation"
                    ? selectedEvent.status_label
                    : selectedEvent.status_label || "Intervention"}
                </StatusPill>
              </div>
            </div>

            <div className="planning-detail-row">
              <span>Horaire</span>
              <strong>
                {formatDateTime(selectedEvent.start)} - {formatTime(selectedEvent.end)}
              </strong>
            </div>

            <div className="planning-detail-row">
              <span>Produit / resume</span>
              <strong>{selectedEvent.subtitle}</strong>
            </div>

            {selectedEvent.reference ? (
              <div className="planning-detail-row">
                <span>Reference</span>
                <strong>{selectedEvent.reference}</strong>
              </div>
            ) : null}

            {selectedEvent.source_type === "reservation" && selectedEvent.reservation ? (
              <>
                <div className="planning-detail-row">
                  <span>Logistique</span>
                  <strong>{selectedEvent.reservation.fulfillment_mode || "pickup"}</strong>
                </div>

                <div className="planning-detail-row">
                  <span>Produits lies</span>
                  <div className="planning-detail-lines">
                    {selectedEvent.reservation.lines.map((line) => (
                      <div key={line.id || `${line.item_id}-${line.quantity}`} className="planning-detail-line">
                        <strong>{line.item_name}</strong>
                        <small>Quantite : {line.quantity}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {selectedEvent.source_type === "delivery" ? (
              <>
                <div className="planning-detail-row">
                  <span>Tournee</span>
                  <strong>{selectedEvent.delivery?.name || "Tournee"}</strong>
                </div>

                {selectedEvent.stop_label ? (
                  <div className="planning-detail-row">
                    <span>Stop</span>
                    <strong>{selectedEvent.stop_label}</strong>
                  </div>
                ) : null}

                {selectedEvent.stop_address ? (
                  <div className="planning-detail-row">
                    <span>Adresse</span>
                    <strong>{selectedEvent.stop_address}</strong>
                  </div>
                ) : null}

                {selectedEvent.linkedReservation ? (
                  <div className="planning-detail-row">
                    <span>Dossier lie</span>
                    <strong>{selectedEvent.linkedReservation.reference}</strong>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </ModalShell>
    </AppShell>
  );
}
