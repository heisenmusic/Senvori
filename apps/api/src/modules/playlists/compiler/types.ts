/**
 * Programming compiler — pure types (Sprint 06 · §17; Sprint 07 · §29).
 *
 * The compiler is a pure function: (context, candidates, rules, fallback) → plan.
 * It never touches the database, HTTP, the clock, or a random source; all
 * variability comes from the derived seed. This is what makes preview,
 * auditability and future offline/sync work (ADR-06-02).
 *
 * Sprint 07 (Intelligent Programming Engine) adds four deterministic layers on
 * top of the Sprint 06 foundation — cross-day fatigue, advanced rotation
 * categories, paired-track avoidance and learned personalization. Every one is
 * optional and off by default: absent its inputs, the engine is a pure superset
 * of v1 behaviour, and the "learning" always happens *outside* the compiler
 * (upstream signals feed `recentPlays`/`affinity`), so the function stays pure
 * and reproducible.
 */

/** Bumped whenever the algorithm changes in a way that could alter output. */
export const COMPILER_VERSION = "2.0.0";

/** A track already loaded and pre-filtered by the caller (no DB in the algorithm). */
export interface CandidateTrack {
  assetId: string;
  title: string;
  durationMs: number;
  /** From `tracks.artist` for music; null when unknown/non-music. */
  artist: string | null;
  /** Which content source/collection it came from — for explainability. */
  source: string;
  /** Relative weight/priority of its source (higher = more likely). Must be > 0. */
  weight: number;
  /**
   * Rotation categories (e.g. genres/energy tags) this track belongs to.
   * Two tracks that share any category are separated by the category gap
   * (Sprint 07 · advanced rotation categories). Omitted ⇒ no category rules.
   */
  categories?: string[];
  /**
   * Plays of this asset over the caller's recent cross-day look-back window.
   * Higher ⇒ more fatigued ⇒ lower effective weight (Sprint 07 · cross-day
   * fatigue). The caller supplies the count from play history; the compiler
   * only applies a deterministic penalty. Omitted/0 ⇒ no fatigue.
   */
  recentPlays?: number;
  /**
   * Learned preference score in [0, 1] for the target audience/daypart (0.5 =
   * neutral). Modulates effective weight when personalization is on (Sprint 07 ·
   * learned personalization). The score is *learned upstream*; the compiler
   * applies it deterministically. Omitted ⇒ neutral (0.5).
   */
  affinity?: number;
}

/** A pair of assets that should not play close together (Sprint 07). */
export interface AvoidPair {
  a: string;
  b: string;
  /** Minimum minutes that must separate the two assets. */
  minGapMinutes: number;
}

/** Cross-day fatigue tuning (Sprint 07). */
export interface FatiguePolicy {
  /**
   * Effective weight is divided by `1 + weightPenalty * recentPlays`. `0`
   * disables fatigue; larger values push variety across days more aggressively.
   */
  weightPenalty: number;
}

/** Learned-personalization tuning (Sprint 07). */
export interface PersonalizationPolicy {
  /**
   * Effective weight is multiplied by `1 + strength * (2 * affinity - 1)` in
   * `[0, 1]`. `0` disables personalization (all affinities neutral); `1` lets a
   * fully-preferred track weigh double and a fully-rejected one weigh ~zero.
   */
  strength: number;
}

/** Anti-repetition rules (maps to `rotation_policies`) + which may be relaxed. */
export interface RotationRules {
  minTrackGapMinutes: number;
  minArtistGapMinutes: number;
  maxPlaysPerTrack?: number | null;
  /**
   * Minimum minutes between two tracks that share a category (Sprint 07).
   * `0`/omitted ⇒ category rules off. Per-category overrides via `categoryGaps`.
   */
  minCategoryGapMinutes?: number;
  /** Per-category gap overrides (minutes); falls back to `minCategoryGapMinutes`. */
  categoryGaps?: Record<string, number>;
  /** Pairs of assets that must not play within their `minGapMinutes` (Sprint 07). */
  avoidPairs?: AvoidPair[];
  /** Cross-day fatigue policy (Sprint 07). Omitted ⇒ off. */
  fatigue?: FatiguePolicy;
  /** Learned personalization policy (Sprint 07). Omitted ⇒ off. */
  personalization?: PersonalizationPolicy;
  /** Rules the compiler may relax to fill the window when the catalog is thin. */
  relaxable: { trackGap: boolean; artistGap: boolean; categoryGap?: boolean };
}

/** Everything that determines a plan. Same context ⇒ same plan (ADR-06-02). */
export interface CompilationContext {
  tenantId: string;
  /** Program (playlist) version identifier — part of the seed. */
  programVersion: string;
  /** Sync group (or unit id) — units in a group share the base sequence (§14). */
  syncGroup: string;
  unitId: string;
  /** IANA timezone of the unit (e.g. "America/Sao_Paulo"). */
  timezone: string;
  /** Local calendar date "YYYY-MM-DD". */
  localDate: string;
  /** Local wall-clock window to fill, "HH:mm" (end may be "24:00"). */
  windowStartLocal: string;
  windowEndLocal: string;
  compilerVersion: string;
}

/** Behaviour when nothing else fits (ADR-06-07). */
export interface FallbackPolicy {
  /** "Conteúdo de segurança" pool used when constraints exhaust the catalog. */
  safety: CandidateTrack[];
  /** If even fallback is empty, fill remaining time with a silence marker. */
  allowSilence: boolean;
}

export type WarningCode =
  | "empty_program"
  | "insufficient_catalog"
  | "track_gap_relaxed"
  | "artist_gap_relaxed"
  | "category_gap_relaxed"
  | "fallback_used"
  | "window_not_filled";

export interface CompilerWarning {
  code: WarningCode;
  /** Internal message; the UI maps the code to product copy (§21 UX writing). */
  message: string;
  detail?: Record<string, unknown>;
}

export interface ExecutionItem {
  position: number;
  assetId: string | null; // null for a silence marker
  title: string;
  artist: string | null;
  startOffsetMs: number; // from window start
  durationMs: number;
  source: string; // collection name, "fallback", or "silence"
  reason: string; // explainability (§17)
}

export interface ExecutionPlan {
  compilerVersion: string;
  seed: string;
  timezone: string;
  localDate: string;
  windowStartUtc: string; // ISO 8601
  windowEndUtc: string; // ISO 8601
  totalDurationMs: number;
  items: ExecutionItem[];
  warnings: CompilerWarning[];
  /** Stable hash over the canonical plan body — reproducibility proof. */
  planHash: string;
  stats: {
    candidateCount: number;
    itemCount: number;
    relaxedRules: string[];
    fallbackCount: number;
    /** Which intelligence layers actually influenced this plan (Sprint 07). */
    engine: {
      /** Fatigue penalty reduced at least one candidate's effective weight. */
      fatigueApplied: boolean;
      /** Personalization moved at least one candidate's effective weight. */
      personalizationApplied: boolean;
      /** Category gaps were enforced (rules configured and categories present). */
      categoriesApplied: boolean;
      /** How many times an avoid-pair blocked an otherwise-eligible candidate. */
      avoidPairBlocks: number;
    };
  };
}

/** Structured, typed compile errors (never thrown as opaque strings). */
export type CompileErrorCode =
  "invalid_timezone" | "invalid_window" | "invalid_date" | "negative_duration";

export class CompileError extends Error {
  constructor(
    readonly code: CompileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CompileError";
  }
}
