export const STOREFRONT_TIME_ZONE = "Europe/Paris";

const WEEKDAY_INDEX_BY_LABEL = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 0,
};

const formatDateParts = (value, timeZone = STOREFRONT_TIME_ZONE) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);

  return {
    year: parts.find((part) => part.type === "year")?.value || "1970",
    month: parts.find((part) => part.type === "month")?.value || "01",
    day: parts.find((part) => part.type === "day")?.value || "01",
  };
};

const getTimeZoneHour = (value, timeZone = STOREFRONT_TIME_ZONE) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(value)
  );

const getTimeZoneWeekday = (value, timeZone = STOREFRONT_TIME_ZONE) =>
  WEEKDAY_INDEX_BY_LABEL[
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(value)
  ] ?? 0;

export const buildDateValue = (offset = 0, referenceDate = new Date(), timeZone = STOREFRONT_TIME_ZONE) => {
  const shiftedDate = new Date(referenceDate.getTime() + offset * 24 * 60 * 60 * 1000);
  const { year, month, day } = formatDateParts(shiftedDate, timeZone);
  return `${year}-${month}-${day}`;
};

export const buildDefaultBookingForm = (referenceDate = new Date(), timeZone = STOREFRONT_TIME_ZONE) => ({
  start_date: buildDateValue(1, referenceDate, timeZone),
  end_date: buildDateValue(2, referenceDate, timeZone),
  start_time: "10:00",
  end_time: "10:00",
});

export const buildStorefrontLiveStatus = (
  referenceDate = new Date(),
  timeZone = STOREFRONT_TIME_ZONE
) => {
  const currentDay = getTimeZoneWeekday(referenceDate, timeZone);
  const currentHour = getTimeZoneHour(referenceDate, timeZone);
  const isOpen = currentDay !== 0 && currentHour >= 9 && currentHour < 19;

  return {
    isOpen,
    label: isOpen ? "Actuellement ouvert" : "Actuellement ferme",
    tone: isOpen ? "success" : "neutral",
  };
};
