/**
 * Scheduling resolver — pure, deterministic (Sprint 08 · §7/§8/§18).
 *
 * Given a scheduling context (the applicable assignments already loaded by the
 * caller, plus the unit's local date/time), it decides WHICH published program
 * plays now — and explains why with a structured code. Like the programming
 * compiler, it is a pure function: no DB, no clock, no random, no locale, no
 * ambient timezone. All variability comes from the explicit inputs, so the same
 * context always resolves to the same selection and the same `effectivePlanHash`.
 */

import { hashPlan } from "../../playlists/compiler/seed";

export type ScheduleTargetType = "tenant" | "group" | "sync_group" | "unit";

/** An assignment as the resolver sees it (loaded + tenant-scoped by the caller). */
export interface ResolverAssignment {
  id: string;
  programId: string;
  programVersionId: string | null;
  targetType: ScheduleTargetType;
  /** unit id / group id / sync-group id / tenant id, matching `targetType`. */
  targetId: string;
  /** Higher wins within the same specificity level. */
  priority: number;
  /** Local weekdays it runs, 0 = Sunday … 6 = Saturday. Empty ⇒ every day. */
  daysOfWeek: number[];
  /** Local wall-clock window "HH:mm"; `start < end` (no cross-midnight in v1). */
  startTimeLocal: string;
  endTimeLocal: string;
  /** Inclusive local calendar validity "YYYY-MM-DD"; null ⇒ open-ended. */
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
}

export interface ScheduleResolutionInput {
  tenantId: string;
  unitId: string;
  /** The unit's sync group, if any. */
  syncGroupId: string | null;
  /** Groups the unit belongs to (for group-level assignments). */
  groupIds: string[];
  timezone: string;
  /** Unit-local date "YYYY-MM-DD" and time "HH:mm" — supplied, never read from a clock. */
  localDate: string;
  localTime: string;
  assignments: ResolverAssignment[];
}

export type SchedulingDecisionCode =
  | "unit_assignment_selected"
  | "group_assignment_selected"
  | "sync_group_assignment_selected"
  | "tenant_default_selected"
  | "assignment_conflict_detected"
  | "fallback_program_selected"
  | "no_assignment";

export interface ScheduleWarning {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface ScheduleResolution {
  selectedAssignmentId: string | null;
  selectedProgramId: string | null;
  selectedProgramVersionId: string | null;
  targetType: ScheduleTargetType | null;
  reasonCode: SchedulingDecisionCode;
  reason: string;
  warnings: ScheduleWarning[];
}

const SPECIFICITY: Record<ScheduleTargetType, number> = {
  unit: 4,
  group: 3,
  sync_group: 2,
  tenant: 1,
};

const CODE_BY_TARGET: Record<ScheduleTargetType, SchedulingDecisionCode> = {
  unit: "unit_assignment_selected",
  group: "group_assignment_selected",
  sync_group: "sync_group_assignment_selected",
  tenant: "tenant_default_selected",
};

/** Local weekday (0 = Sun) for "YYYY-MM-DD" — calendar-only, DST-agnostic. */
export const localWeekday = (localDate: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) throw new Error(`Invalid local date: ${localDate}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
};

const toMinutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** Does the assignment apply to the unit's target scope? */
const targetMatches = (a: ResolverAssignment, input: ScheduleResolutionInput): boolean => {
  switch (a.targetType) {
    case "unit":
      return a.targetId === input.unitId;
    case "group":
      return input.groupIds.includes(a.targetId);
    case "sync_group":
      return input.syncGroupId !== null && a.targetId === input.syncGroupId;
    case "tenant":
      return a.targetId === input.tenantId;
  }
};

/** Is the assignment in effect for this local date + time? */
const isInEffect = (
  a: ResolverAssignment,
  input: ScheduleResolutionInput,
  warnings: ScheduleWarning[],
): boolean => {
  if (!a.active) return false;
  if (a.validFrom !== null && input.localDate < a.validFrom) return false;
  if (a.validUntil !== null && input.localDate > a.validUntil) return false;
  if (a.daysOfWeek.length > 0 && !a.daysOfWeek.includes(localWeekday(input.localDate)))
    return false;

  const start = toMinutes(a.startTimeLocal);
  const end = toMinutes(a.endTimeLocal);
  const now = toMinutes(input.localTime);
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(now)) return false;
  if (start >= end) {
    // Cross-midnight / empty windows are not supported in v1 — flag, don't crash.
    warnings.push({
      code: "invalid_assignment_window",
      message: "Assignment time window is empty or crosses midnight; ignored.",
      detail: { assignmentId: a.id, start: a.startTimeLocal, end: a.endTimeLocal },
    });
    return false;
  }
  return now >= start && now < end;
};

/** Specificity of an assignment's period — narrower is more specific. */
const periodRank = (
  a: ResolverAssignment,
): { bounded: number; windowMin: number; days: number } => ({
  bounded: (a.validFrom !== null ? 1 : 0) + (a.validUntil !== null ? 1 : 0),
  windowMin: toMinutes(a.endTimeLocal) - toMinutes(a.startTimeLocal),
  days: a.daysOfWeek.length === 0 ? 7 : a.daysOfWeek.length,
});

/**
 * Deterministic comparator: higher priority, then a more specific period
 * (bounded validity, narrower window, fewer days), then a stable id tiebreak.
 * Returns negative if `x` should rank before `y`.
 */
const compare = (x: ResolverAssignment, y: ResolverAssignment): number => {
  if (x.priority !== y.priority) return y.priority - x.priority;
  const rx = periodRank(x);
  const ry = periodRank(y);
  if (rx.bounded !== ry.bounded) return ry.bounded - rx.bounded;
  if (rx.windowMin !== ry.windowMin) return rx.windowMin - ry.windowMin;
  if (rx.days !== ry.days) return rx.days - ry.days;
  return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
};

/** Two candidates are an ambiguous tie if every ranking key but the id is equal. */
const isAmbiguousTie = (x: ResolverAssignment, y: ResolverAssignment): boolean => {
  if (x.priority !== y.priority) return false;
  const rx = periodRank(x);
  const ry = periodRank(y);
  return rx.bounded === ry.bounded && rx.windowMin === ry.windowMin && rx.days === ry.days;
};

export const resolveSchedule = (input: ScheduleResolutionInput): ScheduleResolution => {
  const warnings: ScheduleWarning[] = [];
  const candidates = input.assignments.filter(
    (a) => targetMatches(a, input) && isInEffect(a, input, warnings),
  );

  if (candidates.length === 0) {
    return {
      selectedAssignmentId: null,
      selectedProgramId: null,
      selectedProgramVersionId: null,
      targetType: null,
      reasonCode: "no_assignment",
      reason: "No assignment is in effect for this unit at this local date and time.",
      warnings,
    };
  }

  // Most specific target level wins outright (unit > group > sync_group > tenant).
  const topLevel = Math.max(...candidates.map((a) => SPECIFICITY[a.targetType]));
  const atLevel = candidates.filter((a) => SPECIFICITY[a.targetType] === topLevel).sort(compare);

  const best = atLevel[0]!;
  const runnerUp = atLevel[1];
  const conflict = runnerUp !== undefined && isAmbiguousTie(best, runnerUp);
  if (conflict) {
    warnings.push({
      code: "assignment_conflict_detected",
      message: "Two assignments tie at the same specificity, priority and period.",
      detail: { assignmentIds: [best.id, runnerUp.id] },
    });
  }

  return {
    selectedAssignmentId: best.id,
    selectedProgramId: best.programId,
    selectedProgramVersionId: best.programVersionId,
    targetType: best.targetType,
    reasonCode: conflict ? "assignment_conflict_detected" : CODE_BY_TARGET[best.targetType],
    reason: conflict
      ? `Conflicting ${best.targetType} assignments; picked ${best.id} deterministically — resolve the tie.`
      : `Selected the ${best.targetType} assignment (priority ${best.priority}).`,
    warnings,
  };
};

/* ------------------------------------------------------- effective plan -- */

/** An overlay the effective plan carries over the base sequence (Sprint 08). */
export interface EffectiveOverlay {
  kind: "insert" | "overlay" | "interrupt";
  assetId: string | null;
  startOffsetMs: number;
  durationMs: number;
  duckingDb?: number;
  sourceReference: string;
  reasonCode: string;
}

export interface EffectivePlan {
  unitId: string;
  localDate: string;
  timezone: string;
  resolution: ScheduleResolution;
  /** The compiler's base sequence hash (shared across a sync group). */
  basePlanHash: string | null;
  /** Base + deterministically-ordered overlays. Differs from base iff overlays exist. */
  effectivePlanHash: string;
  /** True when an emergency overlay is in effect for this unit + local time. */
  emergencyActive: boolean;
  overlays: EffectiveOverlay[];
  warnings: ScheduleWarning[];
}

/** Stable ordering for overlays before hashing/persisting (§18). */
const overlayOrder = (a: EffectiveOverlay, b: EffectiveOverlay): number =>
  a.startOffsetMs - b.startOffsetMs ||
  a.kind.localeCompare(b.kind) ||
  (a.sourceReference < b.sourceReference ? -1 : a.sourceReference > b.sourceReference ? 1 : 0);

/**
 * Assemble the effective plan: base plan hash (shared) + ordered overlays →
 * a deterministic `effectivePlanHash`. Pure. With no overlays the effective
 * hash still derives from the base, but the base hash stays the sync-group
 * shared identity (§15).
 */
export const assembleEffectivePlan = (params: {
  unitId: string;
  localDate: string;
  timezone: string;
  resolution: ScheduleResolution;
  basePlanHash: string | null;
  overlays: EffectiveOverlay[];
  emergencyActive?: boolean;
  /** Overlay-selection warnings to merge with the resolution's own. */
  overlayWarnings?: ScheduleWarning[];
}): EffectivePlan => {
  const overlays = [...params.overlays].sort(overlayOrder);
  const emergencyActive = params.emergencyActive ?? false;
  const effectivePlanHash = hashPlan({
    basePlanHash: params.basePlanHash,
    selectedAssignmentId: params.resolution.selectedAssignmentId,
    selectedProgramVersionId: params.resolution.selectedProgramVersionId,
    emergencyActive,
    overlays,
  });
  return {
    unitId: params.unitId,
    localDate: params.localDate,
    timezone: params.timezone,
    resolution: params.resolution,
    basePlanHash: params.basePlanHash,
    effectivePlanHash,
    emergencyActive,
    overlays,
    warnings: [...params.resolution.warnings, ...(params.overlayWarnings ?? [])],
  };
};
