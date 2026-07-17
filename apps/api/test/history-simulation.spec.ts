import { describe, expect, it } from "vitest";
import {
  buildPlannedHistory,
  shiftLocalDate,
} from "../src/modules/playlists/history/programming-history";
import {
  COMPILER_VERSION,
  type CandidateTrack,
  type CarryOverItem,
  type CompilationContext,
  type FallbackPolicy,
  type RotationRules,
  compile,
} from "../src/modules/playlists/compiler";

/**
 * Fourteen-day historical simulation (Sprint 07B · §19.3). Exercises the REAL
 * production path — `buildPlannedHistory` feeds `recentPlays` and the seam
 * `carryOver`, then the pure compiler produces the day. Pure: no DB, no clock.
 *
 * Two scenarios keep the properties clean:
 *  A) continuity: fatigue OFF, full-day windows ⇒ the projected previous tail
 *     equals the day's plan, so the seam is strict (last ≠ first, no repeats).
 *  B) fatigue: penalty ON ⇒ heavily-played tracks lose share over the fortnight.
 */

const MIN = 60_000;
const min = (n: number): number => n * MIN;

const DATES = Array.from({ length: 14 }, (_, i) => shiftLocalDate("2026-06-15", i));

const CATALOG: CandidateTrack[] = Array.from({ length: 80 }, (_, i) => ({
  assetId: `t${i}`,
  title: `Track ${i}`,
  artist: `art${i % 12}`,
  categories: [`cat${i % 4}`],
  durationMs: min(3),
  source: "base",
  weight: 1,
}));

const base = (over: Partial<Omit<CompilationContext, "localDate" | "carryOver">> = {}) => ({
  tenantId: "t-sim",
  programVersion: "pv-sim",
  syncGroup: "sg-sim",
  unitId: "u-sim",
  timezone: "America/Sao_Paulo",
  windowStartLocal: "00:00",
  windowEndLocal: "24:00",
  compilerVersion: COMPILER_VERSION,
  ...over,
});

const noFallback: FallbackPolicy = { safety: [], allowSilence: false };

const rules = (over: Partial<RotationRules> = {}): RotationRules => ({
  minTrackGapMinutes: 30,
  minArtistGapMinutes: 10,
  minCategoryGapMinutes: 6,
  maxPlaysPerTrack: null,
  avoidPairs: [{ a: "t0", b: "t1", minGapMinutes: 120 }],
  relaxable: { trackGap: true, artistGap: true, categoryGap: true },
  ...over,
});

interface Day {
  date: string;
  hash: string;
  assetIds: string[];
  plan: ReturnType<typeof compile>;
  carryOver: CarryOverItem[];
}

/** Run the fortnight the way preview does: planned history → compile. */
const runFortnight = (targetRules: RotationRules, lookback: number, continuity: boolean): Day[] => {
  const historyRules: RotationRules = { ...targetRules, fatigue: undefined };
  return DATES.map((date) => {
    const history = buildPlannedHistory({
      base: base(),
      targetLocalDate: date,
      lookbackDays: lookback,
      candidates: CATALOG,
      historyRules,
      fallback: noFallback,
      tailSize: 12,
    });
    const candidates = CATALOG.map((c) => ({
      ...c,
      recentPlays: history.recentTrackPlays[c.assetId] ?? 0,
    }));
    const carryOver = continuity ? history.previousWindowTail : [];
    const plan = compile(
      { ...base(), localDate: date, ...(carryOver.length ? { carryOver } : {}) },
      candidates,
      targetRules,
      noFallback,
    );
    return {
      date,
      hash: plan.planHash,
      assetIds: plan.items.filter((i) => i.assetId !== null).map((i) => i.assetId as string),
      plan,
      carryOver,
    };
  });
};

describe("history-simulation — continuity (fatigue off, full-day)", () => {
  const week = runFortnight(rules(), 7, true);

  it("is reproducible per date", () => {
    const again = runFortnight(rules(), 7, true);
    expect(again.map((d) => d.hash)).toEqual(week.map((d) => d.hash));
  });

  it("produces controlled daily variation (distinct plans, shared catalog)", () => {
    expect(new Set(week.map((d) => d.hash)).size).toBe(14);
    for (let i = 1; i < week.length; i++) {
      expect(week[i].assetIds).not.toEqual(week[i - 1].assetIds);
    }
  });

  it("never opens a day with the previous day's last track (strict seam)", () => {
    for (let i = 1; i < week.length; i++) {
      expect(week[i].assetIds[0]).not.toBe(week[i - 1].assetIds.at(-1));
    }
  });

  it("does not open every day with the same track", () => {
    expect(new Set(week.map((d) => d.assetIds[0])).size).toBeGreaterThanOrEqual(8);
  });

  it("respects avoid pairs and category gaps every day, without fallback", () => {
    for (const d of week) {
      const t0 = d.plan.items.filter((i) => i.assetId === "t0").map((i) => i.startOffsetMs);
      const t1 = d.plan.items.filter((i) => i.assetId === "t1").map((i) => i.startOffsetMs);
      for (const x of t0)
        for (const y of t1) expect(Math.abs(x - y)).toBeGreaterThanOrEqual(min(120));
      const lastByCat = new Map<string, number>();
      for (const it of d.plan.items) {
        if (it.assetId === null) continue;
        for (const cat of CATALOG.find((c) => c.assetId === it.assetId)?.categories ?? []) {
          const prev = lastByCat.get(cat);
          if (prev !== undefined) expect(it.startOffsetMs - prev).toBeGreaterThanOrEqual(min(6));
          lastByCat.set(cat, it.startOffsetMs);
        }
      }
      expect(d.plan.stats.fallbackCount).toBe(0);
    }
  });

  it("emits fortnight metrics for the record", () => {
    const jaccard = (a: string[], b: string[]): number => {
      const A = new Set(a);
      const B = new Set(b);
      const inter = [...A].filter((x) => B.has(x)).length;
      return inter / new Set([...a, ...b]).size;
    };
    const overlaps = week.slice(1).map((d, i) => jaccard(d.assetIds, week[i].assetIds));
    const freq = new Map<string, number>();
    const artistFreq = new Map<string, number>();
    for (const d of week)
      for (const aid of d.assetIds) {
        freq.set(aid, (freq.get(aid) ?? 0) + 1);
        const ar = CATALOG.find((c) => c.assetId === aid)?.artist ?? "?";
        artistFreq.set(ar, (artistFreq.get(ar) ?? 0) + 1);
      }
    const firsts = week.map((d) => d.assetIds[0]);
    let lastToFirst = 0;
    for (let i = 1; i < week.length; i++)
      if (week[i].assetIds[0] === week[i - 1].assetIds.at(-1)) lastToFirst++;

    const metrics = {
      days: week.length,
      avgCrossDayOverlapPct:
        Math.round((overlaps.reduce((s, x) => s + x, 0) / overlaps.length) * 1000) / 10,
      trackFreq: { min: Math.min(...freq.values()), max: Math.max(...freq.values()) },
      artistFreq: { min: Math.min(...artistFreq.values()), max: Math.max(...artistFreq.values()) },
      firstTrackRepetitions: firsts.length - new Set(firsts).size,
      lastToFirstCollisions: lastToFirst,
      relaxedDays: week.filter((d) => d.plan.stats.relaxedRules.length > 0).length,
      fallbackDays: week.filter((d) => d.plan.stats.fallbackCount > 0).length,
    };
    // eslint-disable-next-line no-console
    console.info("[history-simulation] fortnight metrics", JSON.stringify(metrics));
    expect(metrics.lastToFirstCollisions).toBe(0);
    expect(metrics.fallbackDays).toBe(0);
    expect(metrics.avgCrossDayOverlapPct).toBeGreaterThan(0);
    expect(metrics.avgCrossDayOverlapPct).toBeLessThan(100);
  });
});

describe("history-simulation — fatigue (penalty on)", () => {
  it("spreads play frequency: no track dominates the fortnight", () => {
    const week = runFortnight(rules({ fatigue: { weightPenalty: 0.8 } }), 7, true);
    const freq = new Map<string, number>();
    for (const d of week) for (const aid of d.assetIds) freq.set(aid, (freq.get(aid) ?? 0) + 1);
    const counts = [...freq.values()];
    const total = counts.reduce((s, x) => s + x, 0);
    const max = Math.max(...counts);
    // With fatigue, the busiest track stays a small share of all plays.
    expect(max / total).toBeLessThan(0.1);
    // And it stays deterministic.
    const again = runFortnight(rules({ fatigue: { weightPenalty: 0.8 } }), 7, true);
    expect(again.map((d) => d.hash)).toEqual(week.map((d) => d.hash));
  });

  it("terminates safely when rules are impossible (thin catalog, no fallback)", () => {
    const solo: CandidateTrack[] = [
      {
        assetId: "only",
        title: "Only",
        artist: "a",
        durationMs: min(3),
        source: "base",
        weight: 1,
      },
    ];
    const plan = compile(
      { ...base(), localDate: "2026-06-15" },
      solo,
      rules({
        minTrackGapMinutes: 120,
        minArtistGapMinutes: 120,
        minCategoryGapMinutes: 0,
        avoidPairs: [],
        relaxable: { trackGap: false, artistGap: false, categoryGap: false },
      }),
      noFallback,
    );
    expect(plan.items.length).toBe(1);
    expect(plan.warnings.map((w) => w.code)).toContain("window_not_filled");
  });
});

describe("history-simulation — continuity toggle", () => {
  it("with continuity OFF, the seam is not enforced and plans stay deterministic", () => {
    const off = runFortnight(rules(), 7, false);
    const again = runFortnight(rules(), 7, false);
    // Deterministic regardless of the toggle.
    expect(again.map((d) => d.hash)).toEqual(off.map((d) => d.hash));
    // No carryOver supplied ⇒ the cross-day seam is not enforced. (Turning
    // continuity back on changes the plans — the seam does real work.)
    const on = runFortnight(rules(), 7, true);
    expect(on.map((d) => d.hash)).not.toEqual(off.map((d) => d.hash));
  });
});
