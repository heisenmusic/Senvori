import { describe, expect, it } from "vitest";
import {
  buildPlannedHistory,
  priorLocalDates,
  seamGapMinutes,
  shiftLocalDate,
} from "../src/modules/playlists/history/programming-history";
import {
  COMPILER_VERSION,
  type CandidateTrack,
  type CompilationContext,
  type FallbackPolicy,
  type RotationRules,
} from "../src/modules/playlists/compiler";

/**
 * Historical Programming Runtime — pure unit tests (Sprint 07B · §19.1). Prove
 * local calendar-date arithmetic (the "previous day" is a civil-date shift; the
 * timezone only matters when a date is resolved to a UTC instant, which the
 * compiler handles), the seam-gap model, and deterministic planned-history
 * aggregation with no clock and no DB.
 */

const min = (n: number): number => n * 60_000;

const catalog = (n: number): CandidateTrack[] =>
  Array.from({ length: n }, (_, i) => ({
    assetId: `t${i}`,
    title: `Track ${i}`,
    artist: `art${i % 6}`,
    categories: [`cat${i % 3}`],
    durationMs: min(3),
    source: "base",
    weight: 1,
  }));

const base = (over: Partial<Omit<CompilationContext, "localDate" | "carryOver">> = {}) => ({
  tenantId: "t1",
  programVersion: "pv1",
  syncGroup: "sg1",
  unitId: "u1",
  timezone: "America/Sao_Paulo",
  windowStartLocal: "00:00",
  windowEndLocal: "24:00",
  compilerVersion: COMPILER_VERSION,
  ...over,
});

const rules: RotationRules = {
  minTrackGapMinutes: 30,
  minArtistGapMinutes: 10,
  minCategoryGapMinutes: 6,
  maxPlaysPerTrack: null,
  relaxable: { trackGap: true, artistGap: true, categoryGap: true },
};

const noFallback: FallbackPolicy = { safety: [], allowSilence: false };

describe("history — local calendar-date arithmetic", () => {
  it("shifts calendar dates across month and year boundaries", () => {
    expect(shiftLocalDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftLocalDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftLocalDate("2024-03-01", -1)).toBe("2024-02-29"); // leap year
  });

  it("crosses a DST spring-forward boundary by whole calendar days", () => {
    // Sao Paulo has no DST in 2026; New York springs forward 2026-03-08. The
    // date math is calendar-only, so the day before is always the prior date.
    expect(shiftLocalDate("2026-03-09", -1)).toBe("2026-03-08");
    expect(shiftLocalDate("2026-03-08", -1)).toBe("2026-03-07");
  });

  it("lists prior local dates oldest-first", () => {
    expect(priorLocalDates("2026-06-15", 3)).toEqual(["2026-06-12", "2026-06-13", "2026-06-14"]);
    expect(priorLocalDates("2026-06-15", 0)).toEqual([]);
  });
});

describe("history — seam gap", () => {
  it("is zero for a full day and large for a partial window", () => {
    expect(seamGapMinutes("00:00", "24:00")).toBe(0);
    expect(seamGapMinutes("08:00", "12:00")).toBe(1440 - 720 + 480); // 1200 min
  });
});

describe("history — planned aggregation", () => {
  it("is deterministic (same inputs ⇒ identical context)", () => {
    const cat = catalog(40);
    const a = buildPlannedHistory({
      base: base(),
      targetLocalDate: "2026-06-15",
      lookbackDays: 7,
      candidates: cat,
      historyRules: rules,
      fallback: noFallback,
      tailSize: 8,
    });
    const b = buildPlannedHistory({
      base: base(),
      targetLocalDate: "2026-06-15",
      lookbackDays: 7,
      candidates: cat,
      historyRules: rules,
      fallback: noFallback,
      tailSize: 8,
    });
    expect(a).toEqual(b);
  });

  it("counts plays across the look-back and reports the window", () => {
    const cat = catalog(40);
    const h = buildPlannedHistory({
      base: base(),
      targetLocalDate: "2026-06-15",
      lookbackDays: 7,
      candidates: cat,
      historyRules: rules,
      fallback: noFallback,
      tailSize: 8,
    });
    const totalPlays = Object.values(h.recentTrackPlays).reduce((s, n) => s + n, 0);
    expect(totalPlays).toBeGreaterThan(0);
    expect(h.source).toBe("planned_history");
    expect(h.historyFromLocalDate).toBe("2026-06-08");
    expect(h.historyToLocalDate).toBe("2026-06-14");
    expect(h.previousWindowTail.length).toBeGreaterThan(0);
    // The previous day's very last item is adjacent to today (full-day window).
    expect(h.previousWindowTail[0]?.minutesBeforeStart).toBeLessThan(10);
  });

  it("returns an empty tail and no plays with a zero look-back", () => {
    const h = buildPlannedHistory({
      base: base(),
      targetLocalDate: "2026-06-15",
      lookbackDays: 0,
      candidates: catalog(40),
      historyRules: rules,
      fallback: noFallback,
      tailSize: 8,
    });
    expect(h.previousWindowTail).toEqual([]);
    expect(Object.keys(h.recentTrackPlays)).toEqual([]);
  });

  it("keeps the previous-day tail far in the past for a partial window", () => {
    const h = buildPlannedHistory({
      base: base({ windowStartLocal: "08:00", windowEndLocal: "12:00" }),
      targetLocalDate: "2026-06-15",
      lookbackDays: 3,
      candidates: catalog(40),
      historyRules: rules,
      fallback: noFallback,
      tailSize: 4,
    });
    // Partial window ⇒ the seam gap (~1200 min) dominates, so nothing blocks.
    expect(h.previousWindowTail[0]?.minutesBeforeStart).toBeGreaterThan(1000);
  });
});

describe("history — DST boundary (New York spring-forward)", () => {
  it("is deterministic across the 23-hour DST day", () => {
    // Target 2026-03-09 (day after NY springs forward on 2026-03-08). The
    // look-back includes the 23-hour day; per-date UTC resolution is the
    // compiler's job, date math is calendar-only.
    const cat = catalog(40);
    const args = {
      base: base({ timezone: "America/New_York" }),
      targetLocalDate: "2026-03-09",
      lookbackDays: 5,
      candidates: cat,
      historyRules: rules,
      fallback: noFallback,
      tailSize: 8,
    } as const;
    const a = buildPlannedHistory({ ...args });
    const b = buildPlannedHistory({ ...args });
    expect(a).toEqual(b);
    expect(a.historyFromLocalDate).toBe("2026-03-04");
    expect(a.historyToLocalDate).toBe("2026-03-08"); // the DST day
    expect(Object.values(a.recentTrackPlays).reduce((s, n) => s + n, 0)).toBeGreaterThan(0);
  });
});

describe("history — thin catalogs terminate safely", () => {
  it("aggregates and produces a tail with a single track (relaxes, never loops)", () => {
    const one: CandidateTrack[] = [
      {
        assetId: "solo",
        title: "Solo",
        artist: "a",
        durationMs: min(3),
        source: "base",
        weight: 1,
      },
    ];
    const h = buildPlannedHistory({
      base: base(),
      targetLocalDate: "2026-06-15",
      lookbackDays: 3,
      candidates: one,
      historyRules: { ...rules, minTrackGapMinutes: 30 }, // relaxable, so it fills
      fallback: noFallback,
      tailSize: 4,
    });
    expect(h.recentTrackPlays.solo).toBeGreaterThan(0);
    expect(h.previousWindowTail.every((t) => t.assetId === "solo")).toBe(true);
  });

  it("aggregates recent-artist plays when the catalog is a single artist", () => {
    const sameArtist: CandidateTrack[] = Array.from({ length: 12 }, (_, i) => ({
      assetId: `s${i}`,
      title: `S${i}`,
      artist: "one-band",
      durationMs: min(3),
      source: "base",
      weight: 1,
    }));
    const h = buildPlannedHistory({
      base: base(),
      targetLocalDate: "2026-06-15",
      lookbackDays: 4,
      candidates: sameArtist,
      historyRules: { ...rules, minArtistGapMinutes: 0 },
      fallback: noFallback,
      tailSize: 4,
    });
    expect(Object.keys(h.recentArtistPlays)).toEqual(["one-band"]);
    expect(h.recentArtistPlays["one-band"]).toBeGreaterThan(0);
  });
});
