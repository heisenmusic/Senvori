/**
 * Timezone helpers for the device execution plan (Sprint 10A). Pure and
 * DST-correct via the platform Intl timezone database — no static offsets, no
 * external library. Kept local to the Fleet module so it does not couple to the
 * playlists compiler internals.
 */

/** Offset (ms) to add to a UTC instant to get the given zone's wall clock. */
const zoneOffsetMs = (instant: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
};

/** The current unit-local date ("YYYY-MM-DD") and time ("HH:mm") at a zone. */
export const nowInZone = (
  timeZone: string,
  now: Date,
): { localDate: string; localTime: string } => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    localDate: `${get("year")}-${get("month")}-${get("day")}`,
    localTime: `${hour}:${get("minute")}`,
  };
};

/** Resolve a local wall-clock ("YYYY-MM-DD","HH:mm") at a zone to a UTC instant. */
export const zonedWallClockToUtc = (localDate: string, time: string, timeZone: string): Date => {
  const [y, mo, d] = localDate.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Two-pass refinement handles DST boundaries correctly.
  const guess = naive - zoneOffsetMs(new Date(naive), timeZone);
  return new Date(naive - zoneOffsetMs(new Date(guess), timeZone));
};

/** The unit-local calendar-day window [00:00, next-day 00:00) as UTC instants. */
export const localDayWindowUtc = (
  localDate: string,
  timeZone: string,
): { startUtc: Date; endUtc: Date } => {
  const start = zonedWallClockToUtc(localDate, "00:00", timeZone);
  const next = new Date(start.getTime() + 26 * 60 * 60 * 1000); // safely into next day
  const { localDate: nextDate } = nowInZone(timeZone, next);
  return { startUtc: start, endUtc: zonedWallClockToUtc(nextDate, "00:00", timeZone) };
};
