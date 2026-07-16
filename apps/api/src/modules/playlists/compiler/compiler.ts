/**
 * The programming compiler (Sprint 06 · §17; Sprint 07 · §29 — Intelligent
 * Programming Engine).
 *
 * Pure, deterministic, timezone-aware, bounded. Fills a local wall-clock window
 * with a weighted-seeded sequence of tracks, honouring anti-repetition rules,
 * relaxing only relaxable rules when the catalog is thin, falling back to safety
 * content, and never looping forever. Every item carries a human reason.
 *
 * Sprint 07 layers four deterministic intelligence capabilities on top:
 *   1. cross-day fatigue   — de-weight tracks played heavily on recent days;
 *   2. rotation categories — a gap between tracks that share a category;
 *   3. paired-track avoidance — keep configured asset pairs apart;
 *   4. learned personalization — modulate weight by an upstream affinity score.
 * All are opt-in and default to no-op, so the engine is a pure superset of v1.
 */

import { hashPlan } from "./seed";
import { deriveSeed, makeRng } from "./seed";
import { windowDurationMs, zonedWallClockToUtc, assertTimezone } from "./time";
import type {
  CandidateTrack,
  CompilationContext,
  CompilerWarning,
  ExecutionItem,
  ExecutionPlan,
  FallbackPolicy,
  RotationRules,
} from "./types";
import { CompileError } from "./types";

const MIN = 60_000;
/** Hard safety cap on placement attempts — guarantees termination (§17). */
const MAX_ITERATIONS = 100_000;
/** Neutral learned-affinity score; anything else nudges the effective weight. */
const NEUTRAL_AFFINITY = 0.5;

interface Placed {
  assetId: string | null;
  artist: string | null;
  categories: string[];
  startOffsetMs: number;
}

interface RelaxState {
  trackGap: boolean;
  artistGap: boolean;
  categoryGap: boolean;
}

/**
 * Effective weight after the two weight-modulating engine layers
 * (personalization × fatigue). Pure: no clock, no random source. Always ≥ 0.
 */
const effectiveWeight = (c: CandidateTrack, rules: RotationRules): number => {
  let w = Math.max(c.weight, 0);

  const strength = rules.personalization?.strength ?? 0;
  if (strength > 0) {
    const affinity = c.affinity ?? NEUTRAL_AFFINITY;
    // affinity 0 → (1 − strength); 0.5 → 1; 1 → (1 + strength).
    w *= Math.max(1 + strength * (2 * affinity - 1), 0);
  }

  const penalty = rules.fatigue?.weightPenalty ?? 0;
  const recent = c.recentPlays ?? 0;
  if (penalty > 0 && recent > 0) {
    w /= 1 + penalty * recent;
  }

  return w;
};

/** Deterministic weighted choice from a non-empty list, by a weight accessor. */
const weightedPick = (
  rng: () => number,
  items: CandidateTrack[],
  weightOf: (c: CandidateTrack) => number,
): CandidateTrack => {
  let total = 0;
  for (const it of items) total += Math.max(weightOf(it), 0);
  let r = rng() * (total > 0 ? total : items.length);
  for (const it of items) {
    r -= total > 0 ? Math.max(weightOf(it), 0) : 1;
    if (r < 0) return it;
  }
  const fallback = items[0];
  if (fallback === undefined) throw new CompileError("invalid_window", "empty candidate set");
  return fallback;
};

/** Minimum minutes required between two items that share the given category. */
const categoryGapMs = (category: string, rules: RotationRules): number => {
  const override = rules.categoryGaps?.[category];
  const base = override ?? rules.minCategoryGapMinutes ?? 0;
  return base * MIN;
};

/** Largest category gap that applies to a candidate — used for the early exit. */
const maxCategoryGapMs = (c: CandidateTrack, rules: RotationRules): number => {
  if (!c.categories || c.categories.length === 0) return 0;
  let max = 0;
  for (const cat of c.categories) max = Math.max(max, categoryGapMs(cat, rules));
  return max;
};

/** True when placing `c` at `offset` would break an avoid-pair (Sprint 07). */
const violatesAvoidPair = (
  c: CandidateTrack,
  offsetMs: number,
  history: Placed[],
  pairIndex: Map<string, { partner: string; gapMs: number }[]>,
): boolean => {
  const partners = pairIndex.get(c.assetId);
  if (partners === undefined) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h === undefined || h.assetId === null) continue;
    const dt = offsetMs - h.startOffsetMs;
    for (const p of partners) {
      if (p.partner === h.assetId && dt < p.gapMs) return true;
    }
  }
  return false;
};

const passesGaps = (
  c: CandidateTrack,
  offsetMs: number,
  history: Placed[],
  rules: RotationRules,
  relax: RelaxState,
  playCount: Map<string, number>,
): boolean => {
  const maxPlays = rules.maxPlaysPerTrack ?? null;
  if (maxPlays !== null && (playCount.get(c.assetId) ?? 0) >= maxPlays) return false;

  const trackGap = relax.trackGap ? 0 : rules.minTrackGapMinutes * MIN;
  const artistGap = relax.artistGap ? 0 : rules.minArtistGapMinutes * MIN;
  const catGapBound = relax.categoryGap ? 0 : maxCategoryGapMs(c, rules);
  const scanBound = Math.max(trackGap, artistGap, catGapBound);

  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h === undefined) break;
    const dt = offsetMs - h.startOffsetMs;
    if (trackGap > 0 && h.assetId === c.assetId && dt < trackGap) return false;
    if (artistGap > 0 && c.artist !== null && h.artist === c.artist && dt < artistGap) return false;
    if (catGapBound > 0 && c.categories && c.categories.length > 0 && h.categories.length > 0) {
      for (const cat of c.categories) {
        if (!h.categories.includes(cat)) continue;
        const need = categoryGapMs(cat, rules);
        if (need > 0 && dt < need) return false;
      }
    }
    // history is chronological; once older than every active gap we can stop.
    if (dt >= scanBound) break;
  }
  return true;
};

export const compile = (
  context: CompilationContext,
  candidates: CandidateTrack[],
  rules: RotationRules,
  fallback: FallbackPolicy,
): ExecutionPlan => {
  assertTimezone(context.timezone);
  for (const c of candidates) {
    if (c.durationMs <= 0) {
      throw new CompileError("negative_duration", `Track ${c.assetId} has non-positive duration`);
    }
  }

  const windowMs = windowDurationMs(
    context.localDate,
    context.windowStartLocal,
    context.windowEndLocal,
    context.timezone,
  );
  const windowStartUtc = zonedWallClockToUtc(
    context.localDate,
    context.windowStartLocal,
    context.timezone,
  );
  const windowEndUtc = new Date(windowStartUtc.getTime() + windowMs);

  const seed = deriveSeed({
    tenantId: context.tenantId,
    programVersion: context.programVersion,
    syncGroup: context.syncGroup,
    localDate: context.localDate,
    compilerVersion: context.compilerVersion,
  });
  const rng = makeRng(seed);

  // Avoid-pair index: assetId → partners with their required gap (both directions).
  const pairIndex = new Map<string, { partner: string; gapMs: number }[]>();
  for (const pair of rules.avoidPairs ?? []) {
    if (pair.a === pair.b) continue;
    const gapMs = pair.minGapMinutes * MIN;
    for (const [from, to] of [
      [pair.a, pair.b],
      [pair.b, pair.a],
    ] as const) {
      const list = pairIndex.get(from) ?? [];
      list.push({ partner: to, gapMs });
      pairIndex.set(from, list);
    }
  }

  // Which engine layers are active for this compile (config on + data present).
  const catRulesOn =
    (rules.minCategoryGapMinutes ?? 0) > 0 || Object.keys(rules.categoryGaps ?? {}).length > 0;
  const engine = {
    fatigueApplied:
      (rules.fatigue?.weightPenalty ?? 0) > 0 && candidates.some((c) => (c.recentPlays ?? 0) > 0),
    personalizationApplied:
      (rules.personalization?.strength ?? 0) > 0 &&
      candidates.some((c) => c.affinity !== undefined && c.affinity !== NEUTRAL_AFFINITY),
    categoriesApplied: catRulesOn && candidates.some((c) => (c.categories?.length ?? 0) > 0),
    avoidPairBlocks: 0,
  };

  const warnings: CompilerWarning[] = [];
  const relaxedRules = new Set<string>();
  const items: ExecutionItem[] = [];
  const history: Placed[] = [];
  const playCount = new Map<string, number>();
  let offset = 0;
  let fallbackCount = 0;
  let iterations = 0;

  if (candidates.length === 0 && fallback.safety.length === 0) {
    warnings.push({ code: "empty_program", message: "No eligible content to compile." });
  }

  const canRelax = rules.relaxable;

  const place = (c: CandidateTrack, source: string, reason: string): void => {
    items.push({
      position: items.length,
      assetId: c.assetId,
      title: c.title,
      artist: c.artist,
      startOffsetMs: offset,
      durationMs: c.durationMs,
      source,
      reason,
    });
    history.push({
      assetId: c.assetId,
      artist: c.artist,
      categories: c.categories ?? [],
      startOffsetMs: offset,
    });
    playCount.set(c.assetId, (playCount.get(c.assetId) ?? 0) + 1);
    offset += c.durationMs;
  };

  /** Explainability bits for the engine layers that shaped this choice. */
  const engineReasons = (c: CandidateTrack): string[] => {
    const bits: string[] = [];
    if (
      engine.personalizationApplied &&
      c.affinity !== undefined &&
      c.affinity !== NEUTRAL_AFFINITY
    ) {
      bits.push(c.affinity > NEUTRAL_AFFINITY ? "audience-preferred" : "audience-de-emphasized");
    }
    if (engine.fatigueApplied && (c.recentPlays ?? 0) > 0) {
      bits.push("rotation-balanced across days");
    }
    return bits;
  };

  while (offset < windowMs && iterations < MAX_ITERATIONS) {
    iterations++;

    // Progressive relaxation: strict → artist → category → track → fallback.
    const relaxLevels: RelaxState[] = [
      { trackGap: false, artistGap: false, categoryGap: false },
      { trackGap: false, artistGap: canRelax.artistGap, categoryGap: false },
      {
        trackGap: false,
        artistGap: canRelax.artistGap,
        categoryGap: canRelax.categoryGap ?? false,
      },
      {
        trackGap: canRelax.trackGap,
        artistGap: canRelax.artistGap,
        categoryGap: canRelax.categoryGap ?? false,
      },
    ];

    let placed = false;
    let strictLevel = true;
    for (const relax of relaxLevels) {
      const eligibleNow: CandidateTrack[] = [];
      for (const c of candidates) {
        const pairHit = violatesAvoidPair(c, offset, history, pairIndex);
        if (strictLevel && pairHit) engine.avoidPairBlocks++;
        if (pairHit) continue; // hard constraint at every level
        if (passesGaps(c, offset, history, rules, relax, playCount)) eligibleNow.push(c);
      }
      strictLevel = false;
      if (eligibleNow.length === 0) continue;

      const chosen = weightedPick(rng, eligibleNow, (c) => effectiveWeight(c, rules));
      const reasonBits = [`from "${chosen.source}"`, "eligible"];
      if (relax.artistGap && canRelax.artistGap) {
        relaxedRules.add("artist_gap");
        reasonBits.push("artist window relaxed");
      }
      if (relax.categoryGap && (canRelax.categoryGap ?? false)) {
        relaxedRules.add("category_gap");
        reasonBits.push("category window relaxed");
      }
      if (relax.trackGap && canRelax.trackGap) {
        relaxedRules.add("track_gap");
        reasonBits.push("track window relaxed");
      }
      reasonBits.push(...engineReasons(chosen));
      place(chosen, chosen.source, reasonBits.join(", "));
      placed = true;
      break;
    }
    if (placed) continue;

    // Fallback: safety content (ignores gaps by definition — last resort).
    if (fallback.safety.length > 0) {
      const fb = weightedPick(rng, fallback.safety, (c) => Math.max(c.weight, 0));
      place(fb, "fallback", "safety content (catalog exhausted under rules)");
      fallbackCount++;
      continue;
    }

    // Nothing placeable and no fallback: silence or stop.
    if (fallback.allowSilence) {
      const remaining = windowMs - offset;
      items.push({
        position: items.length,
        assetId: null,
        title: "Silêncio",
        artist: null,
        startOffsetMs: offset,
        durationMs: remaining,
        source: "silence",
        reason: "no content available to fill the remaining window",
      });
      offset = windowMs;
    }
    break;
  }

  if (relaxedRules.has("track_gap")) {
    warnings.push({
      code: "track_gap_relaxed",
      message: "Track repetition window relaxed to fill the period.",
    });
  }
  if (relaxedRules.has("artist_gap")) {
    warnings.push({
      code: "artist_gap_relaxed",
      message: "Artist repetition window relaxed to fill the period.",
    });
  }
  if (relaxedRules.has("category_gap")) {
    warnings.push({
      code: "category_gap_relaxed",
      message: "Category repetition window relaxed to fill the period.",
    });
  }
  if (fallbackCount > 0) {
    warnings.push({
      code: "fallback_used",
      message: "Safety content was used to complete the period.",
      detail: { count: fallbackCount },
    });
  }
  if (candidates.length > 0 && (relaxedRules.size > 0 || fallbackCount > 0)) {
    warnings.push({
      code: "insufficient_catalog",
      message: "Not enough content to satisfy all rules for the whole period.",
    });
  }
  if (offset < windowMs) {
    warnings.push({
      code: "window_not_filled",
      message: "The period could not be fully filled.",
      detail: { filledMs: offset, windowMs },
    });
  }

  const body = {
    compilerVersion: context.compilerVersion,
    seed,
    timezone: context.timezone,
    localDate: context.localDate,
    windowStartUtc: windowStartUtc.toISOString(),
    windowEndUtc: windowEndUtc.toISOString(),
    totalDurationMs: offset,
    items,
    warnings,
  };

  return {
    ...body,
    planHash: hashPlan(body),
    stats: {
      candidateCount: candidates.length,
      itemCount: items.length,
      relaxedRules: [...relaxedRules].sort(),
      fallbackCount,
      engine,
    },
  };
};
