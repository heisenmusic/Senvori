import { describe, expect, it } from "vitest";
import {
  COMPILER_VERSION,
  type CandidateTrack,
  type CompilationContext,
  type FallbackPolicy,
  type RotationRules,
  compile,
} from "../src/modules/playlists/compiler";

/**
 * Intelligent Programming Engine tests (Sprint 07 · §29). Pure — no DB, no HTTP.
 * Prove the four deterministic layers (cross-day fatigue, advanced rotation
 * categories, paired-track avoidance, affinity-aware weighting) each work, are
 * reproducible, and stay off when their inputs are absent.
 */

const min = (n: number): number => n * 60_000;

const track = (over: Partial<CandidateTrack> & { assetId: string }): CandidateTrack => ({
  title: `Track ${over.assetId}`,
  artist: over.assetId,
  durationMs: min(3),
  source: "base",
  weight: 1,
  ...over,
});

const ctx = (over: Partial<CompilationContext> = {}): CompilationContext => ({
  tenantId: "t1",
  programVersion: "pv1",
  syncGroup: "sg1",
  unitId: "u1",
  timezone: "America/Sao_Paulo",
  localDate: "2026-06-15",
  windowStartLocal: "08:00",
  windowEndLocal: "12:00",
  compilerVersion: COMPILER_VERSION,
  ...over,
});

const rules = (over: Partial<RotationRules> = {}): RotationRules => ({
  minTrackGapMinutes: 1,
  minArtistGapMinutes: 1,
  maxPlaysPerTrack: null,
  relaxable: { trackGap: true, artistGap: true, categoryGap: true },
  ...over,
});

const noFallback: FallbackPolicy = { safety: [], allowSilence: false };

describe("engine — cross-day fatigue", () => {
  it("plays a fresh track far more often than an equally-weighted fatigued one", () => {
    const cat: CandidateTrack[] = [
      track({ assetId: "fresh", artist: "a1", recentPlays: 0 }),
      track({ assetId: "tired", artist: "a2", recentPlays: 20 }),
    ];
    const withFatigue = compile(ctx(), cat, rules({ fatigue: { weightPenalty: 1 } }), noFallback);
    const fresh = withFatigue.items.filter((i) => i.assetId === "fresh").length;
    const tired = withFatigue.items.filter((i) => i.assetId === "tired").length;
    expect(fresh).toBeGreaterThan(tired);
    expect(withFatigue.stats.engine.fatigueApplied).toBe(true);
  });

  it("is a no-op when the penalty is 0 (default off)", () => {
    const cat: CandidateTrack[] = [
      track({ assetId: "a", artist: "a1", recentPlays: 50 }),
      track({ assetId: "b", artist: "a2", recentPlays: 0 }),
    ];
    const off = compile(ctx(), cat, rules(), noFallback);
    expect(off.stats.engine.fatigueApplied).toBe(false);
  });
});

describe("engine — advanced rotation categories", () => {
  it("keeps two tracks sharing a category apart by the category gap", () => {
    const cat: CandidateTrack[] = Array.from({ length: 12 }, (_, i) =>
      track({ assetId: `r${i}`, artist: `art${i}`, categories: ["rock"] }),
    );
    // No track/artist pressure; category gap is the only separation.
    const p = compile(
      ctx(),
      cat,
      rules({ minCategoryGapMinutes: 30, relaxable: { trackGap: false, artistGap: false } }),
      noFallback,
    );
    const gap = min(30);
    // Any two consecutive "rock" items must be ≥ 30 min apart — but they all
    // share "rock", so effectively every placement respects the 30-min spread.
    let last = -Infinity;
    for (const item of p.items) {
      if (last !== -Infinity) expect(item.startOffsetMs - last).toBeGreaterThanOrEqual(gap);
      last = item.startOffsetMs;
    }
    expect(p.stats.engine.categoriesApplied).toBe(true);
  });

  it("honours a per-category override over the base category gap", () => {
    const cat: CandidateTrack[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        track({ assetId: `j${i}`, artist: `j${i}`, categories: ["jingle"] }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        track({ assetId: `s${i}`, artist: `s${i}`, categories: ["song"] }),
      ),
    ];
    const p = compile(
      ctx(),
      cat,
      rules({
        minCategoryGapMinutes: 5,
        categoryGaps: { jingle: 60 },
        relaxable: { trackGap: false, artistGap: false },
      }),
      noFallback,
    );
    const jingleStarts = p.items
      .filter((i) => i.assetId?.startsWith("j"))
      .map((i) => i.startOffsetMs);
    for (let i = 1; i < jingleStarts.length; i++) {
      expect(jingleStarts[i] - jingleStarts[i - 1]).toBeGreaterThanOrEqual(min(60));
    }
  });

  it("relaxes the category gap (with a warning) when the catalog is too thin", () => {
    const cat: CandidateTrack[] = [
      track({ assetId: "solo", artist: "solo", categories: ["rock"] }),
    ];
    const p = compile(
      ctx(),
      cat,
      rules({
        minCategoryGapMinutes: 60,
        relaxable: { trackGap: false, artistGap: false, categoryGap: true },
      }),
      noFallback,
    );
    expect(p.items.length).toBeGreaterThan(1);
    expect(p.stats.relaxedRules).toContain("category_gap");
    expect(p.warnings.map((w) => w.code)).toContain("category_gap_relaxed");
  });
});

describe("engine — paired-track avoidance", () => {
  it("never places two avoid-paired assets within their gap", () => {
    const cat: CandidateTrack[] = Array.from({ length: 8 }, (_, i) =>
      track({ assetId: `x${i}`, artist: `art${i}` }),
    );
    const p = compile(
      ctx(),
      cat,
      rules({ avoidPairs: [{ a: "x0", b: "x1", minGapMinutes: 60 }] }),
      noFallback,
    );
    const x0 = p.items.filter((i) => i.assetId === "x0").map((i) => i.startOffsetMs);
    const x1 = p.items.filter((i) => i.assetId === "x1").map((i) => i.startOffsetMs);
    for (const a of x0) for (const b of x1) expect(Math.abs(a - b)).toBeGreaterThanOrEqual(min(60));
  });

  it("counts avoid-pair blocks in the engine stats", () => {
    // Two tracks only, paired far apart ⇒ the pair blocks the partner every turn.
    const cat: CandidateTrack[] = [
      track({ assetId: "p0", artist: "p0" }),
      track({ assetId: "p1", artist: "p1" }),
    ];
    const p = compile(
      ctx(),
      cat,
      rules({ avoidPairs: [{ a: "p0", b: "p1", minGapMinutes: 999 }] }),
      {
        safety: [track({ assetId: "safe", artist: "safe", source: "fallback" })],
        allowSilence: false,
      },
    );
    expect(p.stats.engine.avoidPairBlocks).toBeGreaterThan(0);
  });
});

describe("engine — affinity-aware weighting", () => {
  it("plays a high-affinity track more than a low-affinity one at equal base weight", () => {
    const cat: CandidateTrack[] = [
      track({ assetId: "loved", artist: "a1", affinity: 1 }),
      track({ assetId: "meh", artist: "a2", affinity: 0 }),
    ];
    const p = compile(ctx(), cat, rules({ affinityWeighting: { strength: 1 } }), noFallback);
    const loved = p.items.filter((i) => i.assetId === "loved").length;
    const meh = p.items.filter((i) => i.assetId === "meh").length;
    expect(loved).toBeGreaterThan(meh);
    expect(p.stats.engine.affinityApplied).toBe(true);
    const lovedItem = p.items.find((i) => i.assetId === "loved");
    expect(lovedItem?.reason).toContain("audience-preferred");
  });

  it("treats a missing affinity as neutral and stays off at strength 0", () => {
    const cat: CandidateTrack[] = [
      track({ assetId: "a", artist: "a1" }),
      track({ assetId: "b", artist: "a2" }),
    ];
    const p = compile(ctx(), cat, rules({ affinityWeighting: { strength: 0.5 } }), noFallback);
    // affinity undefined everywhere ⇒ neutral ⇒ engine reports not applied.
    expect(p.stats.engine.affinityApplied).toBe(false);
  });
});

describe("engine — determinism preserved", () => {
  it("same intelligent inputs ⇒ identical plan hash and sequence", () => {
    const cat: CandidateTrack[] = Array.from({ length: 20 }, (_, i) =>
      track({
        assetId: `d${i}`,
        artist: `art${i % 5}`,
        categories: [i % 2 === 0 ? "rock" : "pop"],
        recentPlays: i % 3,
        affinity: (i % 10) / 10,
      }),
    );
    const r = rules({
      minCategoryGapMinutes: 20,
      fatigue: { weightPenalty: 0.5 },
      affinityWeighting: { strength: 0.7 },
      avoidPairs: [{ a: "d0", b: "d5", minGapMinutes: 45 }],
    });
    const a = compile(ctx(), cat, r, noFallback);
    const b = compile(ctx(), cat, r, noFallback);
    expect(a.planHash).toBe(b.planHash);
    expect(a.items.map((i) => i.assetId)).toEqual(b.items.map((i) => i.assetId));
  });

  it("reports the compiler as v2.0.0", () => {
    expect(COMPILER_VERSION).toBe("2.0.0");
  });

  it("with no engine inputs, all layers report inactive", () => {
    const cat: CandidateTrack[] = Array.from({ length: 10 }, (_, i) =>
      track({ assetId: `n${i}`, artist: `a${i}` }),
    );
    const p = compile(ctx(), cat, rules(), noFallback);
    expect(p.stats.engine).toEqual({
      fatigueApplied: false,
      affinityApplied: false,
      categoriesApplied: false,
      avoidPairBlocks: 0,
    });
  });
});
