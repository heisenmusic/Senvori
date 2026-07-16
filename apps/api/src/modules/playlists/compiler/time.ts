/**
 * Timezone-aware wall-clock → UTC conversion (Sprint 06 · §9.7, §14).
 *
 * Pure and DST-correct using the platform `Intl` timezone database — no external
 * library, no static offsets. "Local wall-clock at IANA zone" is resolved to the
 * correct UTC instant, including DST transitions.
 */

import { CompileError } from "./types";

/** Offset (localWallClock − utc) in ms for a given instant in a zone. */
const zoneOffsetMs = (utc: Date, timeZone: string): number => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(utc);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - utc.getTime();
};

/** Validate an IANA timezone by attempting to construct a formatter. */
export const assertTimezone = (timeZone: string): void => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new CompileError("invalid_timezone", `Unknown timezone: ${timeZone}`);
  }
};

/**
 * Resolve a local wall-clock (date + "HH:mm") in `timeZone` to the UTC instant.
 * Uses the standard two-pass guess/refine so DST boundaries resolve correctly.
 * `time` may be "24:00" to denote end-of-day (00:00 of the next day).
 */
export const zonedWallClockToUtc = (localDate: string, time: string, timeZone: string): Date => {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!dm) throw new CompileError("invalid_date", `Invalid local date: ${localDate}`);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!tm) throw new CompileError("invalid_window", `Invalid time: ${time}`);

  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  let h = Number(tm[1]);
  const mi = Number(tm[2]);
  let dayShift = 0;
  if (h === 24 && mi === 0) {
    h = 0;
    dayShift = 1;
  }
  if (h > 23 || mi > 59) throw new CompileError("invalid_window", `Invalid time: ${time}`);

  const guess = Date.UTC(y, mo - 1, d + dayShift, h, mi, 0);
  // First offset at the naive guess, then refine once against the corrected instant.
  let utc = guess - zoneOffsetMs(new Date(guess), timeZone);
  utc = guess - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
};

/** Window duration in ms between two local wall-clock times on the same local date. */
export const windowDurationMs = (
  localDate: string,
  startLocal: string,
  endLocal: string,
  timeZone: string,
): number => {
  const start = zonedWallClockToUtc(localDate, startLocal, timeZone);
  const end = zonedWallClockToUtc(localDate, endLocal, timeZone);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) {
    throw new CompileError(
      "invalid_window",
      `Window end must be after start (${startLocal}–${endLocal})`,
    );
  }
  return ms;
};
