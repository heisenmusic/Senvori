/**
 * Programming compiler — pure types (Sprint 06 · §17).
 *
 * The compiler is a pure function: (context, candidates, rules, fallback) → plan.
 * It never touches the database, HTTP, the clock, or a random source; all
 * variability comes from the derived seed. This is what makes preview,
 * auditability and future offline/sync work (ADR-06-02).
 */

/** Bumped whenever the algorithm changes in a way that could alter output. */
export const COMPILER_VERSION = "1.0.0";

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
}

/** Anti-repetition rules (maps to `rotation_policies`) + which may be relaxed. */
export interface RotationRules {
  minTrackGapMinutes: number;
  minArtistGapMinutes: number;
  maxPlaysPerTrack?: number | null;
  /** Rules the compiler may relax to fill the window when the catalog is thin. */
  relaxable: { trackGap: boolean; artistGap: boolean };
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
