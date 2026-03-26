export const addDays = (date, amount) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
};

export const addMonths = (date, amount) => {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + amount);
  return nextDate;
};

export const startOfWeek = (date) => {
  const nextDate = new Date(date);
  const day = nextDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  nextDate.setDate(nextDate.getDate() + diff);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
};

export const endOfWeek = (date) => {
  const nextDate = startOfWeek(date);
  nextDate.setDate(nextDate.getDate() + 6);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
};

export const startOfDay = (date) => {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
};

export const endOfDay = (date) => {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
};

export const startOfMonth = (date) => {
  const nextDate = new Date(date);
  nextDate.setDate(1);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
};

export const endOfMonth = (date) => {
  const nextDate = startOfMonth(date);
  nextDate.setMonth(nextDate.getMonth() + 1);
  nextDate.setMilliseconds(-1);
  return nextDate;
};

export const formatCurrency = (value) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export const formatDate = (value, options = {}) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(new Date(value));

export const formatDateTime = (value) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export const formatTime = (value) =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export const formatMonthLabel = (value) =>
  new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(value));

export const formatWeekday = (value, options = {}) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...options,
  }).format(new Date(value));

export const formatNumber = (value) =>
  new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const toDateTimeLocalValue = (value) => {
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

export const toDateInputValue = (value) => toDateTimeLocalValue(value).slice(0, 10);

export const getDaysInRange = (start, length) =>
  Array.from({ length }, (_, index) => addDays(start, index));

export const getDaysInMonth = (value) => {
  const monthStart = startOfMonth(value);
  const monthEnd = endOfMonth(value);
  const days = [];
  const cursor = new Date(monthStart);

  while (cursor <= monthEnd) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
};

export const differenceInCalendarDays = (start, end) => {
  const startDate = startOfDay(start);
  const endDate = startOfDay(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
};

export const isDateInRange = (value, start, end) => {
  const date = new Date(value);
  return date >= new Date(start) && date <= new Date(end);
};

export const isSameDay = (left, right) => {
  const leftDate = new Date(left);
  const rightDate = new Date(right);

  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
};

export const isReservationOnDay = (reservation, day) => {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  const reservationStart = new Date(reservation.start_date);
  const reservationEnd = new Date(reservation.end_date);

  return reservationStart <= dayEnd && reservationEnd >= dayStart;
};
