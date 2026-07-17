import { describe, expect, it } from "vitest";
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
 * Cross-day simulation battery (Sprint 07 · §29.5). Pure — no DB, no HTTP.
 *
 * This drives the engine over SEVEN consecutive local dates with a feedback
 * loop the production wiring does not yet supply: after each day we recompute
 * `recentPlays` from the prior days and pass the previous day's tail as
 * `carryOver`. It is a *simulation* of the intended signal pipeline (Sprint
 * 07B), not proof that fatigue/affinity are wired end-to-end — see
 * PROGRAMMING_ENGINE.md for the honest capability matrix.
 *
 * It proves the engine, given those signals, produces varied-but-deterministic
 * weeks: distinct daily sequences, per-date reproducibility, first-track
 * variation, no cross-day seam repeat, fatigue reduction, avoid-pair and
 * category separation, and safe termination when the rules are impossible.
 */

const MIN = 60_000;
const min = (n: number): number => n * MIN;

const DATES = [
  "2026-06-15",
  "2026-06-16",
  "2026-06-17",
  "2026-06-18",
  "2026-06-19",
  "2026-06-20",
  "2026-06-21",
];

/** A catalog large enough to fill a 4-hour day for a week without relaxing. */
const CATALOG = Array.from({ length: 60 }, (_, i): CandidateTrack => ({
  assetId: `t${i}`,
  title: `Track ${i}`,
  artist: `art${i % 10}`,
  categories: [`cat${i % 3}`],
  durationMs: min(3),
  source: "base",
  weight: 1,
}));

const baseRules = (over: Partial<RotationRules> = {}): RotationRules => ({
  minTrackGapMinutes: 30,
  minArtistGapMinutes: 10,
  minCategoryGapMinutes: 6,
  maxPlaysPerTrack: null,
  fatigue: { weightPenalty: 0.6 },
  avoidPairs: [{ a: "t0", b: "t1", minGapMinutes: 60 }],
  relaxable: { trackGap: true, artistGap: true, categoryGap: true },
  ...over,
});

const ctx = (localDate: string, carryOver?: CarryOverItem[]): CompilationContext => ({
  tenantId: "tenant-sim",
  programVersion: "pv-sim",
  syncGroup: "sg-sim",
  unitId: "u-sim",
  timezone: "America/Sao_Paulo",
  localDate,
  windowStartLocal: "08:00",
  windowEndLocal: "12:00",
  compilerVersion: COMPILER_VERSION,
  carryOver,
});

const noFallback: FallbackPolicy = { safety: [], allowSilence: false };

interface DayResult {
  date: string;
  hash: string;
  assetIds: string[];
  starts: Map<string, number[]>; // assetId → start offsets
  plan: ReturnType<typeof compile>;
}

/** Build carryOver from the last 3 real items of a plan (most recent first). */
const tailFrom = (plan: ReturnType<typeof compile>): CarryOverItem[] => {
  const real = plan.items.filter((i) => i.assetId !== null);
  const last3 = real.slice(-3);
  // The last item "just played" (1 min ago); older ones a few minutes earlier.
  return last3.reverse().map((it, idx) => ({
    assetId: it.assetId,
    artist: it.artist,
    categories: CATALOG.find((c) => c.assetId === it.assetId)?.categories ?? [],
    minutesBeforeStart: 1 + idx * 3,
  }));
};

/** Run the week with the fatigue/seam feedback loop. Deterministic. */
const runWeek = (): DayResult[] => {
  const results: DayResult[] = [];
  // recentPlays over a sliding 3-day look-back window.
  const perDayPlays: Map<string, number>[] = [];
  let carry: CarryOverItem[] | undefined;

  for (const date of DATES) {
    const recent = new Map<string, number>();
    for (const day of perDayPlays.slice(-3)) {
      for (const [id, n] of day) recent.set(id, (recent.get(id) ?? 0) + n);
    }
    const candidates = CATALOG.map((c) => ({ ...c, recentPlays: recent.get(c.assetId) ?? 0 }));
    const plan = compile(ctx(date, carry), candidates, baseRules(), noFallback);

    const starts = new Map<string, number[]>();
    const todayPlays = new Map<string, number>();
    for (const it of plan.items) {
      if (it.assetId === null) continue;
      (starts.get(it.assetId) ?? starts.set(it.assetId, []).get(it.assetId)!).push(
        it.startOffsetMs,
      );
      todayPlays.set(it.assetId, (todayPlays.get(it.assetId) ?? 0) + 1);
    }
    perDayPlays.push(todayPlays);
    carry = tailFrom(plan);
    results.push({
      date,
      hash: plan.planHash,
      assetIds: plan.items.filter((i) => i.assetId !== null).map((i) => i.assetId as string),
      starts,
      plan,
    });
  }
  return results;
};

const week = runWeek();

describe("simulation — seven consecutive days", () => {
  it("produces a distinct sequence every day (daily variation)", () => {
    const hashes = new Set(week.map((d) => d.hash));
    expect(hashes.size).toBe(7);
    for (let i = 1; i < week.length; i++) {
      expect(week[i].assetIds).not.toEqual(week[i - 1].assetIds);
    }
  });

  it("is reproducible per date (same inputs ⇒ same plan)", () => {
    // Re-run the whole week from scratch: identical feedback ⇒ identical hashes.
    const again = runWeek();
    expect(again.map((d) => d.hash)).toEqual(week.map((d) => d.hash));
  });

  it("does not open every day with the same track", () => {
    const firsts = week.map((d) => d.assetIds[0]);
    const distinct = new Set(firsts);
    expect(distinct.size).toBeGreaterThanOrEqual(5);
  });

  it("never starts a day with the previous day's last track (cross-day seam)", () => {
    for (let i = 1; i < week.length; i++) {
      const prevLast = week[i - 1].assetIds.at(-1);
      const currFirst = week[i].assetIds[0];
      expect(currFirst).not.toBe(prevLast);
    }
  });

  it("suppresses tracks with high recent play counts", () => {
    // Rebuild the recentPlays that entered the final day, then compare the
    // most-fatigued quartile's play share on that day to the freshest quartile.
    const recent = new Map<string, number>();
    for (const d of week.slice(-4, -1)) {
      for (const [id, arr] of d.starts) recent.set(id, (recent.get(id) ?? 0) + arr.length);
    }
    const finalDay = week.at(-1)!;
    const playsOn = (id: string): number => finalDay.starts.get(id)?.length ?? 0;
    const ranked = CATALOG.map((c) => c.assetId).sort(
      (a, b) => (recent.get(b) ?? 0) - (recent.get(a) ?? 0),
    );
    const q = Math.floor(ranked.length / 4);
    const fatigued = ranked.slice(0, q);
    const fresh = ranked.slice(-q);
    const avg = (ids: string[]): number => ids.reduce((s, id) => s + playsOn(id), 0) / ids.length;
    expect(avg(fatigued)).toBeLessThan(avg(fresh));
  });

  it("keeps avoid-paired assets apart on every day", () => {
    for (const d of week) {
      const a = d.starts.get("t0") ?? [];
      const b = d.starts.get("t1") ?? [];
      for (const x of a) for (const y of b) expect(Math.abs(x - y)).toBeGreaterThanOrEqual(min(60));
    }
  });

  it("respects the category gap on every day", () => {
    for (const d of week) {
      const lastByCat = new Map<string, number>();
      for (const it of d.plan.items) {
        if (it.assetId === null) continue;
        const cats = CATALOG.find((c) => c.assetId === it.assetId)?.categories ?? [];
        for (const cat of cats) {
          const prev = lastByCat.get(cat);
          if (prev !== undefined) {
            expect(it.startOffsetMs - prev).toBeGreaterThanOrEqual(min(6));
          }
          lastByCat.set(cat, it.startOffsetMs);
        }
      }
    }
  });

  it("fills each day from the catalog without safety fallback", () => {
    for (const d of week) {
      expect(d.plan.stats.fallbackCount).toBe(0);
      expect(d.plan.items.length).toBeGreaterThan(50);
    }
  });

  it("emits cross-day metrics for the record", () => {
    const jaccard = (a: string[], b: string[]): number => {
      const A = new Set(a);
      const B = new Set(b);
      const inter = [...A].filter((x) => B.has(x)).length;
      const union = new Set([...a, ...b]).size;
      return union === 0 ? 0 : inter / union;
    };
    const overlaps = week.slice(1).map((d, i) => jaccard(d.assetIds, week[i].assetIds));
    const avgOverlap = overlaps.reduce((s, x) => s + x, 0) / overlaps.length;

    const totalPlays = new Map<string, number>();
    const artistPlays = new Map<string, number>();
    for (const d of week) {
      for (const [id, arr] of d.starts) {
        totalPlays.set(id, (totalPlays.get(id) ?? 0) + arr.length);
        const artist = CATALOG.find((c) => c.assetId === id)?.artist ?? "?";
        artistPlays.set(artist, (artistPlays.get(artist) ?? 0) + arr.length);
      }
    }
    const trackCounts = [...totalPlays.values()];
    const firsts = week.map((d) => d.assetIds[0]);
    const firstRepeat = firsts.length - new Set(firsts).size;
    const relaxedDays = week.filter((d) => d.plan.stats.relaxedRules.length > 0).length;
    const fallbackDays = week.filter((d) => d.plan.stats.fallbackCount > 0).length;
    let pairViolations = 0;
    for (const d of week) {
      const a = d.starts.get("t0") ?? [];
      const b = d.starts.get("t1") ?? [];
      for (const x of a) for (const y of b) if (Math.abs(x - y) < min(60)) pairViolations++;
    }

    const metrics = {
      avgCrossDayOverlapPct: Math.round(avgOverlap * 1000) / 10,
      trackFrequency: { min: Math.min(...trackCounts), max: Math.max(...trackCounts) },
      artistFrequency: {
        min: Math.min(...artistPlays.values()),
        max: Math.max(...artistPlays.values()),
      },
      firstTrackRepetitions: firstRepeat,
      pairRepetitions: pairViolations,
      daysWithRelaxedRules: relaxedDays,
      daysWithFallback: fallbackDays,
    };
    // eslint-disable-next-line no-console
    console.info("[engine-simulation] weekly metrics", JSON.stringify(metrics));

    // Sanity gates on the metrics themselves.
    expect(metrics.pairRepetitions).toBe(0);
    expect(metrics.daysWithFallback).toBe(0);
    expect(metrics.avgCrossDayOverlapPct).toBeGreaterThan(0); // days do share catalog
    expect(metrics.avgCrossDayOverlapPct).toBeLessThan(100); // but are not identical
  });
});

describe("simulation — safe termination when rules are impossible", () => {
  it("stops with a window-not-filled warning instead of looping", () => {
    // One 3-min track, a 60-min track gap, no relaxation, no fallback: nothing
    // can legally fill a 4-hour window ⇒ terminate with one item + a warning.
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
      ctx("2026-06-15"),
      solo,
      baseRules({
        minTrackGapMinutes: 60,
        minArtistGapMinutes: 60,
        minCategoryGapMinutes: 0,
        fatigue: undefined,
        avoidPairs: [],
        relaxable: { trackGap: false, artistGap: false, categoryGap: false },
      }),
      noFallback,
    );
    expect(plan.items.length).toBe(1);
    expect(plan.warnings.map((w) => w.code)).toContain("window_not_filled");
  });
});
