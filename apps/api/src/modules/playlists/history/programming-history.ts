/**
 * Historical Programming Runtime — planned history (Sprint 07B · §7–§9).
 *
 * Pure and deterministic: no DB, no clock, no random source. The compiler stays
 * a pure function; this module derives the *history inputs* it consumes
 * (`recentPlays`, `carryOver`) from what the program **would have played** on the
 * prior local dates, by re-compiling those dates deterministically.
 *
 * This is `planned_history` — a reproducible projection of the schedule, NOT a
 * record that a track was actually reproduced. `verified_playback_history` (from
 * Proof-of-Play) is a future source; the shape is the same so the caller can
 * swap providers without touching the compiler.
 */

import { compile } from "../compiler";
import type {
  CandidateTrack,
  CarryOverItem,
  CompilationContext,
  FallbackPolicy,
  RotationRules,
} from "../compiler";

export type HistorySource = "planned_history" | "verified_playback_history";

/** The history the compiler input assembly needs (Sprint 07B · §8). */
export interface HistoricalProgrammingContext {
  source: HistorySource;
  lookbackDays: number;
  recentTrackPlays: Record<string, number>;
  recentArtistPlays: Record<string, number>;
  /** Tail of the immediately-previous local day, ready to seed the seam. */
  previousWindowTail: CarryOverItem[];
  /** Inclusive first / exclusive-ish last local date of the look-back. */
  historyFromLocalDate: string;
  historyToLocalDate: string;
}

/**
 * A provider of programming history. The initial implementation is planned
 * history; a Proof-of-Play-backed provider can implement the same contract
 * later (§7.3) without any compiler change.
 */
export interface ProgrammingHistoryProvider {
  build(input: BuildHistoryInput): HistoricalProgrammingContext;
}

export interface BuildHistoryInput {
  /** Everything that defines a compile except the date and carry-over. */
  base: Omit<CompilationContext, "localDate" | "carryOver">;
  targetLocalDate: string;
  lookbackDays: number;
  candidates: CandidateTrack[];
  /** Rules for the *historical* re-compiles — fatigue/carry-over must be OFF. */
  historyRules: RotationRules;
  fallback: FallbackPolicy;
  /** How many trailing items of the previous day to carry across the seam. */
  tailSize: number;
}

const MIN = 60_000;

/** Minutes since local midnight for "HH:mm" (or 1440 for "24:00"). */
const parseLocalMinutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
};

/**
 * Shift a local calendar date "YYYY-MM-DD" by whole days. Date-only arithmetic
 * on the proleptic Gregorian calendar — DST-agnostic by construction (the
 * timezone only matters when a date+time is resolved to a UTC instant, which the
 * compiler already handles per date). "2026-03-09" − 1 day = "2026-03-08".
 */
export const shiftLocalDate = (localDate: string, deltaDays: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) throw new Error(`Invalid local date: ${localDate}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
};

/** Prior local dates [target − lookback, target − 1], oldest first. */
export const priorLocalDates = (targetLocalDate: string, lookbackDays: number): string[] => {
  const out: string[] = [];
  for (let i = lookbackDays; i >= 1; i--) out.push(shiftLocalDate(targetLocalDate, -i));
  return out;
};

/**
 * Wall-clock minutes between the end of one day's window and the start of the
 * next day's window, for the same daily `[start, end]`. For a full-day window
 * (00:00–24:00) this is 0 (adjacent); for a partial window it is large, so the
 * seam correctly stops mattering when days are not contiguous.
 */
export const seamGapMinutes = (startLocal: string, endLocal: string): number =>
  1440 - parseLocalMinutes(endLocal) + parseLocalMinutes(startLocal);

/** Deterministic planned-history provider (§7.2). */
export const buildPlannedHistory = (input: BuildHistoryInput): HistoricalProgrammingContext => {
  const { base, targetLocalDate, lookbackDays, candidates, historyRules, fallback, tailSize } =
    input;

  const recentTrackPlays: Record<string, number> = {};
  const recentArtistPlays: Record<string, number> = {};
  let previousWindowTail: CarryOverItem[] = [];

  const dates = priorLocalDates(targetLocalDate, lookbackDays);
  const previousDate = shiftLocalDate(targetLocalDate, -1);
  const seam = seamGapMinutes(base.windowStartLocal, base.windowEndLocal);

  for (const date of dates) {
    // Historical re-compile: no carry-over, and historyRules has fatigue OFF, so
    // there is no recursion and the projection is fully deterministic.
    const plan = compile({ ...base, localDate: date }, candidates, historyRules, fallback);

    for (const it of plan.items) {
      if (it.assetId === null) continue;
      recentTrackPlays[it.assetId] = (recentTrackPlays[it.assetId] ?? 0) + 1;
      if (it.artist) recentArtistPlays[it.artist] = (recentArtistPlays[it.artist] ?? 0) + 1;
    }

    if (date === previousDate) {
      const windowMs =
        new Date(plan.windowEndUtc).getTime() - new Date(plan.windowStartUtc).getTime();
      const real = plan.items.filter((i) => i.assetId !== null);
      previousWindowTail = real
        .slice(-tailSize)
        .reverse()
        .map((it) => ({
          assetId: it.assetId,
          artist: it.artist,
          categories: candidates.find((c) => c.assetId === it.assetId)?.categories ?? [],
          // How long before *today's* window start this item started (wall-clock).
          minutesBeforeStart: seam + Math.round((windowMs - it.startOffsetMs) / MIN),
        }));
    }
  }

  return {
    source: "planned_history",
    lookbackDays,
    recentTrackPlays,
    recentArtistPlays,
    previousWindowTail,
    historyFromLocalDate: dates[0] ?? targetLocalDate,
    historyToLocalDate: previousDate,
  };
};
