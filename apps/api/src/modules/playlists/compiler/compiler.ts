/**
 * The programming compiler (Sprint 06 · §17).
 *
 * Pure, deterministic, timezone-aware, bounded. Fills a local wall-clock window
 * with a weighted-seeded sequence of tracks, honouring anti-repetition rules,
 * relaxing only relaxable rules when the catalog is thin, falling back to safety
 * content, and never looping forever. Every item carries a human reason.
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

interface Placed {
  assetId: string | null;
  artist: string | null;
  startOffsetMs: number;
}

/** Deterministic weighted choice from a non-empty list. */
const weightedPick = (rng: () => number, items: CandidateTrack[]): CandidateTrack => {
  let total = 0;
  for (const it of items) total += Math.max(it.weight, 0);
  let r = rng() * (total > 0 ? total : items.length);
  for (const it of items) {
    r -= total > 0 ? Math.max(it.weight, 0) : 1;
    if (r < 0) return it;
  }
  const fallback = items[0];
  if (fallback === undefined) throw new CompileError("invalid_window", "empty candidate set");
  return fallback;
};

const passesGaps = (
  c: CandidateTrack,
  offsetMs: number,
  history: Placed[],
  rules: RotationRules,
  relax: { trackGap: boolean; artistGap: boolean },
  playCount: Map<string, number>,
): boolean => {
  const maxPlays = rules.maxPlaysPerTrack ?? null;
  if (maxPlays !== null && (playCount.get(c.assetId) ?? 0) >= maxPlays) return false;

  const trackGap = relax.trackGap ? 0 : rules.minTrackGapMinutes * MIN;
  const artistGap = relax.artistGap ? 0 : rules.minArtistGapMinutes * MIN;

  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h === undefined) break;
    const dt = offsetMs - h.startOffsetMs;
    if (trackGap > 0 && h.assetId === c.assetId && dt < trackGap) return false;
    if (artistGap > 0 && c.artist !== null && h.artist === c.artist && dt < artistGap) return false;
    // history is chronological; once older than both gaps we can stop early.
    if (dt >= trackGap && dt >= artistGap) break;
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
    history.push({ assetId: c.assetId, artist: c.artist, startOffsetMs: offset });
    playCount.set(c.assetId, (playCount.get(c.assetId) ?? 0) + 1);
    offset += c.durationMs;
  };

  while (offset < windowMs && iterations < MAX_ITERATIONS) {
    iterations++;

    // Progressive relaxation: strict → relax artist → relax track → fallback.
    const relaxLevels: { trackGap: boolean; artistGap: boolean }[] = [
      { trackGap: false, artistGap: false },
      { trackGap: false, artistGap: rules.relaxable.artistGap },
      { trackGap: rules.relaxable.trackGap, artistGap: rules.relaxable.artistGap },
    ];

    let placed = false;
    for (const relax of relaxLevels) {
      const eligibleNow = candidates.filter((c) =>
        passesGaps(c, offset, history, rules, relax, playCount),
      );
      if (eligibleNow.length === 0) continue;
      const chosen = weightedPick(rng, eligibleNow);
      const reasonBits = [`from "${chosen.source}"`, "eligible"];
      if (relax.artistGap && rules.relaxable.artistGap) {
        relaxedRules.add("artist_gap");
        reasonBits.push("artist window relaxed");
      }
      if (relax.trackGap && rules.relaxable.trackGap) {
        relaxedRules.add("track_gap");
        reasonBits.push("track window relaxed");
      }
      place(chosen, chosen.source, reasonBits.join(", "));
      placed = true;
      break;
    }
    if (placed) continue;

    // Fallback: safety content (ignores gaps by definition — last resort).
    if (fallback.safety.length > 0) {
      const fb = weightedPick(rng, fallback.safety);
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
    },
  };
};
