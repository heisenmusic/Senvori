import { describe, expect, it } from "vitest";
import {
  COMPILER_VERSION,
  type CandidateTrack,
  type CompilationContext,
  type FallbackPolicy,
  type RotationRules,
  compile,
  zonedWallClockToUtc,
} from "../src/modules/playlists/compiler";

/**
 * Compiler unit tests (Sprint 06 · §25). Pure — no DB, no HTTP. Prove
 * determinism, timezone/DST correctness, rotation rules, fallback and
 * termination.
 */

const min = (n: number): number => n * 60_000;

const track = (
  id: string,
  artist: string,
  durationMin = 3,
  source = "base",
  weight = 1,
): CandidateTrack => ({
  assetId: id,
  title: `Track ${id}`,
  artist,
  durationMs: min(durationMin),
  source,
  weight,
});

const ctx = (over: Partial<CompilationContext> = {}): CompilationContext => ({
  tenantId: "t1",
  programVersion: "pv1",
  syncGroup: "sg1",
  unitId: "u1",
  timezone: "America/Sao_Paulo",
  localDate: "2026-06-15",
  windowStartLocal: "08:00",
  windowEndLocal: "10:00",
  compilerVersion: COMPILER_VERSION,
  ...over,
});

const rules = (over: Partial<RotationRules> = {}): RotationRules => ({
  minTrackGapMinutes: 30,
  minArtistGapMinutes: 15,
  maxPlaysPerTrack: null,
  relaxable: { trackGap: true, artistGap: true },
  ...over,
});

const noFallback: FallbackPolicy = { safety: [], allowSilence: false };

const bigCatalog = (): CandidateTrack[] =>
  Array.from({ length: 40 }, (_, i) => track(`a${i}`, `artist${i % 8}`));

describe("compiler — determinism", () => {
  it("same inputs produce an identical plan hash", () => {
    const c = ctx();
    const r = rules();
    const cat = bigCatalog();
    const p1 = compile(c, cat, r, noFallback);
    const p2 = compile(c, cat, r, noFallback);
    expect(p1.planHash).toBe(p2.planHash);
    expect(p1.items.map((i) => i.assetId)).toEqual(p2.items.map((i) => i.assetId));
    expect(p1.seed).toBe(p2.seed);
  });

  it("a different local date yields a different sequence (daily variation)", () => {
    const cat = bigCatalog();
    const r = rules();
    const a = compile(ctx({ localDate: "2026-06-15" }), cat, r, noFallback);
    const b = compile(ctx({ localDate: "2026-06-16" }), cat, r, noFallback);
    expect(a.planHash).not.toBe(b.planHash);
  });

  it("a different sync group yields a different sequence", () => {
    const cat = bigCatalog();
    const r = rules();
    const a = compile(ctx({ syncGroup: "sgA" }), cat, r, noFallback);
    const b = compile(ctx({ syncGroup: "sgB" }), cat, r, noFallback);
    expect(a.seed).not.toBe(b.seed);
  });
});

describe("compiler — rotation rules", () => {
  it("respects the track gap when the catalog is large enough", () => {
    const p = compile(ctx(), bigCatalog(), rules({ minTrackGapMinutes: 30 }), noFallback);
    const gapMs = min(30);
    const lastStart = new Map<string, number>();
    for (const item of p.items) {
      if (item.assetId === null) continue;
      const prev = lastStart.get(item.assetId);
      if (prev !== undefined) expect(item.startOffsetMs - prev).toBeGreaterThanOrEqual(gapMs);
      lastStart.set(item.assetId, item.startOffsetMs);
    }
    expect(p.stats.relaxedRules).toEqual([]);
  });

  it("respects the artist gap when possible", () => {
    const p = compile(ctx(), bigCatalog(), rules({ minArtistGapMinutes: 15 }), noFallback);
    const gapMs = min(15);
    const lastArtist = new Map<string, number>();
    for (const item of p.items) {
      if (!item.artist) continue;
      const prev = lastArtist.get(item.artist);
      if (prev !== undefined) expect(item.startOffsetMs - prev).toBeGreaterThanOrEqual(gapMs);
      lastArtist.set(item.artist, item.startOffsetMs);
    }
  });

  it("honours a source weight (heavier source dominates)", () => {
    const cat: CandidateTrack[] = [
      ...Array.from({ length: 5 }, (_, i) => track(`h${i}`, `h${i}`, 3, "heavy", 10)),
      ...Array.from({ length: 5 }, (_, i) => track(`l${i}`, `l${i}`, 3, "light", 1)),
    ];
    const p = compile(
      ctx({ windowEndLocal: "12:00" }),
      cat,
      rules({ minTrackGapMinutes: 1, minArtistGapMinutes: 1 }),
      noFallback,
    );
    const heavy = p.items.filter((i) => i.source === "heavy").length;
    const light = p.items.filter((i) => i.source === "light").length;
    expect(heavy).toBeGreaterThan(light);
  });
});

describe("compiler — insufficient catalog & fallback (ADR-06-07)", () => {
  it("relaxes relaxable rules and warns when the catalog is thin", () => {
    const cat = [track("solo", "onlyartist", 3)];
    const p = compile(
      ctx(),
      cat,
      rules({ minTrackGapMinutes: 30, minArtistGapMinutes: 15 }),
      noFallback,
    );
    expect(p.items.length).toBeGreaterThan(1); // filled by relaxing the track gap
    expect(p.stats.relaxedRules).toContain("track_gap");
    expect(p.warnings.map((w) => w.code)).toContain("insufficient_catalog");
    expect(p.warnings.map((w) => w.code)).toContain("track_gap_relaxed");
  });

  it("uses safety fallback when no eligible content exists", () => {
    const fallback: FallbackPolicy = {
      safety: [track("safe", "safe", 3, "fallback")],
      allowSilence: false,
    };
    const p = compile(ctx(), [], rules(), fallback);
    expect(p.stats.fallbackCount).toBeGreaterThan(0);
    expect(p.items.every((i) => i.source === "fallback")).toBe(true);
    expect(p.warnings.map((w) => w.code)).toContain("fallback_used");
  });

  it("empty program with silence allowed fills a single silence marker", () => {
    const fallback: FallbackPolicy = { safety: [], allowSilence: true };
    const p = compile(ctx(), [], rules(), fallback);
    expect(p.warnings.map((w) => w.code)).toContain("empty_program");
    expect(p.items).toHaveLength(1);
    expect(p.items[0].source).toBe("silence");
    expect(p.items[0].durationMs).toBe(min(120));
  });

  it("terminates (no infinite loop) when nothing fits and silence is off", () => {
    const p = compile(ctx(), [], rules(), noFallback);
    expect(p.items).toHaveLength(0);
    expect(p.warnings.map((w) => w.code)).toContain("window_not_filled");
  });
});

describe("compiler — window & duration", () => {
  it("fills close to the window and never overfills the last start", () => {
    const p = compile(
      ctx({ windowEndLocal: "09:00" }),
      bigCatalog(),
      rules({ minTrackGapMinutes: 1 }),
      noFallback,
    );
    expect(p.totalDurationMs).toBeGreaterThanOrEqual(min(60));
    // last item starts before the window end
    const last = p.items.at(-1);
    expect(last && last.startOffsetMs).toBeLessThan(min(60));
  });
});

describe("compiler — timezone & DST (§9.7)", () => {
  it("resolves Sao_Paulo (UTC-3 year round)", () => {
    const p = compile(
      ctx({ timezone: "America/Sao_Paulo", localDate: "2026-06-15", windowStartLocal: "08:00" }),
      bigCatalog(),
      rules(),
      noFallback,
    );
    expect(p.windowStartUtc).toBe("2026-06-15T11:00:00.000Z");
  });

  it("resolves New_York summer (EDT, UTC-4) and winter (EST, UTC-5)", () => {
    expect(zonedWallClockToUtc("2026-06-15", "08:00", "America/New_York").toISOString()).toBe(
      "2026-06-15T12:00:00.000Z",
    );
    expect(zonedWallClockToUtc("2026-01-15", "08:00", "America/New_York").toISOString()).toBe(
      "2026-01-15T13:00:00.000Z",
    );
  });

  it("resolves Madrid summer (CEST, UTC+2) and winter (CET, UTC+1)", () => {
    expect(zonedWallClockToUtc("2026-06-15", "08:00", "Europe/Madrid").toISOString()).toBe(
      "2026-06-15T06:00:00.000Z",
    );
    expect(zonedWallClockToUtc("2026-01-15", "08:00", "Europe/Madrid").toISOString()).toBe(
      "2026-01-15T07:00:00.000Z",
    );
  });

  it("handles the New_York spring-forward DST boundary", () => {
    // Before the 2026-03-08 transition: EST (UTC-5); after: EDT (UTC-4).
    expect(zonedWallClockToUtc("2026-03-07", "12:00", "America/New_York").toISOString()).toBe(
      "2026-03-07T17:00:00.000Z",
    );
    expect(zonedWallClockToUtc("2026-03-09", "12:00", "America/New_York").toISOString()).toBe(
      "2026-03-09T16:00:00.000Z",
    );
  });

  it("rejects an invalid timezone with a structured error", () => {
    expect(() =>
      compile(ctx({ timezone: "Mars/Phobos" }), bigCatalog(), rules(), noFallback),
    ).toThrow(/Unknown timezone/);
  });
});
