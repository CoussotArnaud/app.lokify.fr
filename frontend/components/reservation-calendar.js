import {
  addDays,
  formatDate,
  formatTime,
  isReservationOnDay,
  startOfWeek,
} from "../lib/date";

const statusLabels = {
  draft: "Brouillon",
  confirmed: "Confirmee",
  completed: "Terminee",
  cancelled: "Annulee",
};

const EventCard = ({ reservation }) => (
  <article className="calendar-event">
    <span className={`status-badge ${reservation.status}`}>{statusLabels[reservation.status]}</span>
    <strong>{reservation.item_name}</strong>
    <p>{reservation.client_name}</p>
    <small>
      {formatTime(reservation.start_date)} - {formatTime(reservation.end_date)}
    </small>
  </article>
);

export default function ReservationCalendar({ reservations, view, referenceDate }) {
  if (view === "day") {
    const dayReservations = reservations.filter((reservation) =>
      isReservationOnDay(reservation, referenceDate)
    );

    return (
      <div className="calendar-day">
        <div className="calendar-day-header">
          <strong>{formatDate(referenceDate, { weekday: "long", month: "long", day: "numeric" })}</strong>
          <span>{dayReservations.length} reservation(s)</span>
        </div>
        <div className="calendar-list">
          {dayReservations.length ? (
            dayReservations.map((reservation) => (
              <EventCard key={reservation.id} reservation={reservation} />
            ))
          ) : (
            <p className="muted-text">Aucune reservation sur cette journee.</p>
          )}
        </div>
      </div>
    );
  }

  const weekStart = startOfWeek(referenceDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div className="calendar-grid">
      {days.map((day) => {
        const dayReservations = reservations.filter((reservation) => isReservationOnDay(reservation, day));

        return (
          <section key={day.toISOString()} className="calendar-column">
            <div className="calendar-column-header">
              <strong>{formatDate(day, { weekday: "short", day: "numeric", month: "short" })}</strong>
              <span>{dayReservations.length} event(s)</span>
            </div>
            <div className="calendar-column-body">
              {dayReservations.length ? (
                dayReservations.map((reservation) => (
                  <EventCard key={`${reservation.id}-${day.toISOString()}`} reservation={reservation} />
                ))
              ) : (
                <p className="muted-text">Libre</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
