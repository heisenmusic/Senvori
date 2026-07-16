/**
 * Pure presentation helpers for the Programming feature. No React, no I/O — so
 * they are unit-tested directly (test/programs.test.ts). The dashboard shows
 * product language only; technical concepts (plan hash, compiler, offsets) are
 * translated here into human strings.
 */

/** Compiler warning codes the UI has product copy for (§16). */
export const KNOWN_WARNING_CODES = [
  "empty_program",
  "insufficient_catalog",
  "track_gap_relaxed",
  "artist_gap_relaxed",
  "fallback_used",
  "window_not_filled",
] as const;
export type KnownWarningCode = (typeof KNOWN_WARNING_CODES)[number];

/** Map a warning code to its i18n suffix; anything unknown falls back cleanly. */
export const warningKey = (code: string): KnownWarningCode | "generic" =>
  (KNOWN_WARNING_CODES as readonly string[]).includes(code)
    ? (code as KnownWarningCode)
    : "generic";

/** "M:SS" clock for a single item or short duration. */
export const formatClock = (ms: number | null | undefined): string => {
  if (!ms || ms <= 0) return "0:00";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/** Compact "2 h 30 min" / "45 min" for a total duration (h/min read across locales). */
export const formatHoursMinutes = (ms: number | null | undefined): string => {
  if (!ms || ms <= 0) return "0 min";
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
};

/**
 * Local wall-clock time of a plan item, computed from the plan's UTC window
 * start plus the item offset, formatted in the plan's IANA timezone. This is
 * what makes "14:05" correct even across DST — the offset math is UTC, the
 * display is zoned.
 */
export const itemClock = (
  windowStartUtc: string,
  startOffsetMs: number,
  timezone: string,
  locale: string,
): string => {
  const instant = new Date(new Date(windowStartUtc).getTime() + startOffsetMs);
  if (Number.isNaN(instant.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(instant);
  }
};

/** "a82f…19cd" short identifier for a plan/version hash (never shown raw). */
export const shortHash = (hash: string | null | undefined): string => {
  if (!hash) return "—";
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
};

/** Localized date+time for created/updated/published timestamps. */
export const formatDateTime = (iso: string | null | undefined, locale: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
};

/** Sum of item durations (nulls treated as 0). */
export const totalDurationMs = (items: ReadonlyArray<{ durationMs: number | null }>): number =>
  items.reduce((acc, i) => acc + (i.durationMs ?? 0), 0);

/** Today's date as YYYY-MM-DD in the given IANA timezone (default preview date). */
export const todayLocalISODate = (timezone: string | undefined, now: Date = new Date()): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
};

/** A UI badge variant name for a program/asset status (color is never the only signal). */
export const programStatusVariant = (status: string): "success" | "neutral" | "default" =>
  status === "published" ? "success" : status === "archived" ? "neutral" : "default";
